/**
 * Minimal in-process job scheduler.
 *
 * Each job runs on its own interval, never overlaps itself, and takes a Postgres advisory lock
 * for the duration of a run, so when several app instances run the same schedule only one of
 * them executes each run. Failures are logged and retried on the next tick.
 */
import { pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';

export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

const timers = new Set<NodeJS.Timeout>();
const running = new Set<Promise<void>>();
let stopped = false;

/** Stable 32-bit key for the job's advisory lock. */
function lockKey(name: string): number {
  let hash = 0;
  for (const char of `job:${name}`) hash = (Math.imul(31, hash) + char.charCodeAt(0)) | 0;
  return hash;
}

async function runOnce(job: Job): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [lockKey(job.name)]);
    if (!rows[0].locked) return; // another instance is running it
    try {
      const result = await job.run();
      logger.debug('Job finished', { job: job.name, result });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockKey(job.name)]);
    }
  } catch (error) {
    logger.error('Job failed', { job: job.name, error });
  } finally {
    client.release();
  }
}

function schedule(job: Job): void {
  const timer = setTimeout(async () => {
    timers.delete(timer);
    const run = runOnce(job);
    running.add(run);
    await run;
    running.delete(run);
    if (!stopped) schedule(job);
  }, job.intervalMs);
  timers.add(timer);
}

export function startJobs(jobs: Job[]): void {
  stopped = false;
  for (const job of jobs) schedule(job);
  logger.info('Background jobs started', { jobs: jobs.map((job) => job.name) });
}

/** Cancels future runs and waits for runs in progress (called on shutdown). */
export async function stopJobs(): Promise<void> {
  stopped = true;
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  await Promise.all(running);
}
