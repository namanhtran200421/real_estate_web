/**
 * Admin authentication.
 *
 * Login issues a random bearer token (256 bits). Only its SHA-256 hash is stored, so a leaked
 * database backup cannot be used to sign in. Sessions expire after ADMIN_SESSION_HOURS and
 * can be revoked by logging out or changing the password.
 */
import { env } from '../../config/env.js';
import { isPgError, PG_ERROR } from '../../db/pool.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { adminAuthRepository } from './admin-auth.repository.js';
import type { AdminIdentity, AdminSession } from './admin-auth.types.js';
import { DUMMY_HASH, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from './password.js';

interface ClientInfo {
  ip: string | undefined;
  userAgent: string | undefined;
}

/** @throws HttpError 401 with the same message whether the email or the password is wrong. */
async function login(email: string, password: string, client: ClientInfo): Promise<AdminSession> {
  const admin = await adminAuthRepository.findByEmail(email);
  // Always run the (slow) hash check so timing does not reveal whether the email exists.
  const valid = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !valid) throw HttpError.unauthorized('Email hoặc mật khẩu không đúng.');

  const token = randomToken();
  const expiresAt = await adminAuthRepository.createSession(
    admin.id,
    sha256Hex(token),
    env.admin.sessionHours,
    client.ip,
    client.userAgent,
  );
  await adminAuthRepository.recordLogin(admin.id);

  return { token, expiresAt: expiresAt.toISOString(), admin: { id: admin.id, email: admin.email, name: admin.name } };
}

/** @returns the admin for a valid, unexpired token, or undefined. */
async function authenticate(token: string): Promise<AdminIdentity | undefined> {
  return adminAuthRepository.findSessionAdmin(sha256Hex(token));
}

async function logout(token: string): Promise<void> {
  await adminAuthRepository.deleteSession(sha256Hex(token));
}

function assertStrongPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw HttpError.validation([{ path: 'newPassword', message: `Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` }]);
  }
}

/** Changes the password and signs out every other session of this admin. */
async function changePassword(
  admin: AdminIdentity,
  currentToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const account = await adminAuthRepository.findById(admin.id);
  if (!account || !(await verifyPassword(currentPassword, account.password_hash))) {
    throw HttpError.validation([{ path: 'currentPassword', message: 'Mật khẩu hiện tại không đúng.' }]);
  }
  assertStrongPassword(newPassword);

  await adminAuthRepository.updatePassword(admin.id, await hashPassword(newPassword));
  await adminAuthRepository.deleteOtherSessions(admin.id, sha256Hex(currentToken));
}

/** Used by the `admin:create` command. */
async function createAdmin(email: string, name: string, password: string): Promise<AdminIdentity> {
  assertStrongPassword(password);
  try {
    return await adminAuthRepository.create(email, name, await hashPassword(password));
  } catch (error) {
    if (isPgError(error, PG_ERROR.uniqueViolation)) {
      throw HttpError.conflict('ADMIN_EXISTS', `An admin with email ${email} already exists`);
    }
    throw error;
  }
}

async function purgeExpiredSessions(): Promise<number> {
  return adminAuthRepository.deleteExpiredSessions();
}

export const adminAuthService = { login, authenticate, logout, changePassword, createAdmin, purgeExpiredSessions };
