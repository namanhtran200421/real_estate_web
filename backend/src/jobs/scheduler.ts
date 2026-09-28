/**
 * Minimal in-process job scheduler.
 *
 * Each job runs on its own interval, never overlaps itself, and takes a Postgres advisory lock
 * for the duration of a run, so when several app instances run the same schedule only one of
 * them executes each run. Failures are logged and retried on the next tick.
 *
 * The lock is transaction-scoped (held by an open transaction, released by COMMIT). A
 * session-scoped lock is unsafe behind a transaction-mode pooler such as Neon's: lock and unlock
 * can reach different server connections, leaving a lock held forever and the job skipped.
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
  let client;
  let broken = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock($1) AS locked', [
      lockKey(job.name),
    ]);
    // Not locked: another instance is running it. Otherwise the job runs on its own connections.
    if (rows[0].locked) {
      const result = await job.run();
      logger.debug('Job finished', { job: job.name, result });
    }
  } catch (error) {
    logger.error('Job failed', { job: job.name, error });
  } finally {
    if (client) {
      // Ends the transaction, which releases the lock. A connection that cannot is discarded.
      try {
        await client.query('COMMIT');
      } catch (error) {
        broken = true;
        logger.error('Job lock release failed', { job: job.name, error });
      }
      client.release(broken);
    }
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
