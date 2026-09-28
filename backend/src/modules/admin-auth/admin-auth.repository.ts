/**
 * Admin accounts and sessions data access.
 */
import { query, queryOne } from '../../db/pool.js';
import type { AdminIdentity } from './admin-auth.types.js';

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

/** The admin behind an unexpired session. */
async function findSessionAdmin(tokenHash: string): Promise<AdminIdentity | undefined> {
  return queryOne<AdminIdentity>(
    `SELECT u.id, u.email, u.name
     FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
}

async function deleteSession(tokenHash: string): Promise<void> {
  await query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash]);
}

/** Signs the admin out everywhere except the given session (after a password change). */
async function deleteOtherSessions(adminId: string, keepTokenHash: string): Promise<void> {
  await query('DELETE FROM admin_sessions WHERE admin_id = $1 AND token_hash <> $2', [adminId, keepTokenHash]);
}

async function deleteExpiredSessions(): Promise<number> {
  const rows = await query('DELETE FROM admin_sessions WHERE expires_at < now() RETURNING id');
  return rows.length;
}

export const adminAuthRepository = {
  findByEmail,
  findById,
  create,
  updatePassword,
  recordLogin,
  createSession,
  findSessionAdmin,
  deleteSession,
  deleteOtherSessions,
  deleteExpiredSessions,
};
