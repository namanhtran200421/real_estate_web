/**
 * PostgreSQL connection pool.
 *
 * One pool per process, shared by every repository. Only repositories should import this
 * module; controllers and services never touch SQL.
 *
 * Protection against overload:
 * - `max` caps concurrent connections, so a traffic spike queues requests instead of
 *   exhausting the database's connection slots.
 * - `connectionTimeoutMillis` fails fast when the pool is saturated rather than letting
 *   requests wait forever.
 * - `statement_timeout` makes Postgres cancel any runaway query.
 */
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

// DATE columns arrive as 'yyyy-mm-dd' strings. pg's default turns them into Date objects at
// local midnight, which silently shifts the day when server and business time zones differ.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value) => value);

/** The pool itself, or a client checked out for a transaction. Repositories accept either. */
export type Db = pg.Pool | pg.PoolClient;

function sslOptions(): pg.PoolConfig['ssl'] {
  if (!env.db.ssl) return false;
  return { rejectUnauthorized: true };
}

export const pool = new pg.Pool({
  connectionString: env.db.url,
  max: env.db.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: env.db.statementTimeoutMs,
  // Client-side safety net in case the server never answers (e.g. network partition).
  query_timeout: env.db.statementTimeoutMs + 1_000,
  options: `-c timezone=${env.timezone}`,
  application_name: 'real-estate-api',
  ssl: sslOptions(),
});

// An idle client can lose its connection (DB restart, network blip). Without this listener
// the error would be unhandled and crash the process; the pool replaces the client itself.
pool.on('error', (error) => {
  logger.error('Idle database client error', { error });
});

/**
 * Runs a parameterised query and returns its rows. Always pass user input through `params`,
 * never string concatenation. Pass `db` (a transaction client) to run inside a transaction.
 */
export async function query<Row extends pg.QueryResultRow>(text: string, params: unknown[] = [], db: Db = pool): Promise<Row[]> {
  const result = await db.query<Row>(text, params);
  return result.rows;
}

/** Like `query`, for statements expected to return at most one row. */
export async function queryOne<Row extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<Row | undefined> {
  const rows = await query<Row>(text, params, db);
  return rows[0];
}

/** Postgres error codes the services react to. */
export const PG_ERROR = {
  uniqueViolation: '23505',
  exclusionViolation: '23P01',
  foreignKeyViolation: '23503',
} as const;

export function isPgError(error: unknown, code: string): boolean {
  return error instanceof pg.DatabaseError && error.code === code;
}

/**
 * Runs `work` inside a transaction on a dedicated client: commits if it resolves, rolls back
 * if it throws. Use it whenever several statements must succeed or fail together.
 */
export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Cheap round trip used by the readiness probe. */
export async function pingDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closePool(): Promise<void> {
  await pool.end();
}
