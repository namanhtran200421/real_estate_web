/**
 * Database migration runner.
 *
 * Applies every `migrations/*.sql` file that has not run yet, in file-name order, each inside
 * its own transaction, and records it in `schema_migrations`. Applied files must never be
 * edited: to change the schema, add a new numbered file.
 *
 * A Postgres advisory lock ensures only one runner works at a time, so it is safe to run on
 * every deploy even when several instances start together.
 *
 * Usage: `npm run db:migrate` (compiled) or `npm run db:migrate:dev` (TypeScript, via tsx).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../lib/logger.js';
import { closePool, pool, withTransaction } from './pool.js';

/** `migrations/` sits at the backend root; this file runs from `src/db` or `dist/db`. */
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');

/** Arbitrary constant identifying this app's migration lock. */
const MIGRATION_LOCK_ID = 72_531_001;

async function pendingMigrations(): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .filter((file) => !applied.has(file));
}

async function applyMigration(file: string): Promise<void> {
  const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
  await withTransaction(async (client) => {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  });
  logger.info('Migration applied', { file });
}

async function migrate(): Promise<void> {
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    const pending = await pendingMigrations();
    if (pending.length === 0) {
      logger.info('Database schema is up to date');
      return;
    }
    for (const file of pending) {
      await applyMigration(file);
    }
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    lock.release();
  }
}

try {
  await migrate();
} catch (error) {
  logger.error('Migration failed', { error });
  process.exitCode = 1;
} finally {
  await closePool();
}
