/**
 * Minimal structured logger.
 *
 * Writes one JSON object per line (stdout for info/debug, stderr for warn/error), which every
 * log platform (CloudWatch, Datadog, Loki, Vercel, Railway, …) can parse and filter without
 * extra configuration. Entries below `LOG_LEVEL` are dropped.
 */
import { env, type LogLevel } from '../config/env.js';

const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

type Fields = Record<string, unknown>;

/**
 * Turns an Error into a plain object; JSON.stringify would otherwise reduce it to `{}`.
 * Keeps `code` (e.g. ECONNREFUSED, Postgres SQLSTATE) and the inner errors of an
 * AggregateError, which Node uses when every address of a host refuses the connection.
 */
function serializeError(error: Error): Fields {
  const result: Fields = { name: error.name, message: error.message, stack: error.stack };
  if ('code' in error) result.code = error.code;
  if (error instanceof AggregateError) {
    result.errors = error.errors.map((inner: unknown) => {
      if (inner instanceof Error) return serializeError(inner);
      return inner;
    });
  }
  return result;
}

function serialize(fields: Fields): Fields {
  const result: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Error) {
      result[key] = serializeError(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function write(level: LogLevel, message: string, fields: Fields = {}): void {
  if (SEVERITY[level] < SEVERITY[env.logLevel]) return;

  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...serialize(fields) });
  if (SEVERITY[level] >= SEVERITY.warn) {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (message: string, fields?: Fields) => write('debug', message, fields),
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
};
