/**
 * Admin accounts and sessions data access.
 */
import { query, queryOne } from '../../db/pool.js';
import type { AdminIdentity, AdminSessionInfo } from './admin-auth.types.js';

interface AdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

async function findByEmail(email: string): Promise<AdminRow | undefined> {
  return queryOne<AdminRow>('SELECT id, email, name, password_hash FROM admin_users WHERE lower(email) = lower($1)', [
    email,
  ]);
}

async function findById(id: string): Promise<AdminRow | undefined> {
  return queryOne<AdminRow>('SELECT id, email, name, password_hash FROM admin_users WHERE id = $1', [id]);
}

async function create(email: string, name: string, passwordHash: string): Promise<AdminIdentity> {
  const row = await queryOne<AdminIdentity>(
    'INSERT INTO admin_users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
    [email, name, passwordHash],
  );
  return row!;
}

async function updatePassword(id: string, passwordHash: string): Promise<void> {
  await query('UPDATE admin_users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
}

async function recordLogin(id: string): Promise<void> {
  await query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [id]);
}

async function createSession(
  adminId: string,
  tokenHash: string,
  hours: number,
  ip: string | undefined,
  userAgent: string | undefined,
): Promise<Date> {
  const row = await queryOne<{ expires_at: Date }>(
    `INSERT INTO admin_sessions (admin_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)
     RETURNING expires_at`,
    [adminId, tokenHash, hours, ip ?? null, userAgent?.slice(0, 500) ?? null],
  );
  return row!.expires_at;
}

/**
 * The admin behind a live session (not expired, used within `idleMinutes`), marking it as used
 * now so an active admin stays signed in.
 */
async function touchSession(tokenHash: string, idleMinutes: number): Promise<{ admin: AdminIdentity; sessionId: string } | undefined> {
  const row = await queryOne<AdminIdentity & { session_id: string }>(
    `UPDATE admin_sessions s SET last_seen_at = now()
     FROM admin_users u
     WHERE s.token_hash = $1 AND u.id = s.admin_id
       AND s.expires_at > now() AND s.last_seen_at > now() - make_interval(mins => $2)
     RETURNING u.id, u.email, u.name, s.id AS session_id`,
    [tokenHash, idleMinutes],
  );
  if (!row) return undefined;
  return { admin: { id: row.id, email: row.email, name: row.name }, sessionId: row.session_id };
}

/** The admin's live sessions, most recently used first. */
async function listSessions(adminId: string, idleMinutes: number, currentSessionId: string): Promise<AdminSessionInfo[]> {
  const rows = await query<{
    id: string;
    created_at: Date;
    last_seen_at: Date;
    expires_at: Date;
    ip: string | null;
    user_agent: string | null;
  }>(
    `SELECT id, created_at, last_seen_at, expires_at, host(ip) AS ip, user_agent
     FROM admin_sessions
     WHERE admin_id = $1 AND expires_at > now() AND last_seen_at > now() - make_interval(mins => $2)
     ORDER BY last_seen_at DESC`,
    [adminId, idleMinutes],
  );
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    ip: row.ip,
    userAgent: row.user_agent,
    current: row.id === currentSessionId,
  }));
}

/** Signs one of the admin's own sessions out. @returns false when there was no such session */
async function deleteOwnSession(adminId: string, sessionId: string): Promise<boolean> {
  const rows = await query('DELETE FROM admin_sessions WHERE id = $1 AND admin_id = $2 RETURNING id', [sessionId, adminId]);
  return rows.length > 0;
}

async function deleteSession(tokenHash: string): Promise<void> {
  await query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash]);
}

/** Signs the admin out everywhere except the given session (after a password change). */
async function deleteOtherSessions(adminId: string, keepTokenHash: string): Promise<void> {
  await query('DELETE FROM admin_sessions WHERE admin_id = $1 AND token_hash <> $2', [adminId, keepTokenHash]);
}

/** Sessions past their absolute expiry or idle for longer than `idleMinutes`. */
async function deleteExpiredSessions(idleMinutes: number): Promise<number> {
  const rows = await query(
    'DELETE FROM admin_sessions WHERE expires_at < now() OR last_seen_at < now() - make_interval(mins => $1) RETURNING id',
    [idleMinutes],
  );
  return rows.length;
}

export const adminAuthRepository = {
  findByEmail,
  findById,
  create,
  updatePassword,
  recordLogin,
  createSession,
  touchSession,
  listSessions,
  deleteOwnSession,
  deleteSession,
  deleteOtherSessions,
  deleteExpiredSessions,
};
