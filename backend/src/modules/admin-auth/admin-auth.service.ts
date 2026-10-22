/**
 * Admin authentication.
 *
 * Login (CAPTCHA + rate limits in front) issues a random bearer token (256 bits). Only its SHA-256
 * hash is stored, so a leaked database backup cannot be used to sign in. A session ends after
 * ADMIN_IDLE_MINUTES without use or ADMIN_SESSION_HOURS in all, and can be revoked: by logging
 * out, from the account page's device list, or by changing the password (which signs out every
 * other device and emails the admin).
 */
import { env } from '../../config/env.js';
import { isPgError, PG_ERROR, withTransaction } from '../../db/pool.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { emailService } from '../notifications/email.service.js';
import { adminAuthRepository } from './admin-auth.repository.js';
import type { AdminIdentity, AdminSession, AdminSessionInfo } from './admin-auth.types.js';
import { DUMMY_HASH, hashPassword, needsPasswordRehash, passwordProblem, verifyPassword } from './password.js';

interface ClientInfo {
  ip: string | undefined;
  userAgent: string | undefined;
}

function credentialsChanged(): HttpError {
  return HttpError.unauthorized('Thông tin đăng nhập đã thay đổi, vui lòng đăng nhập lại.');
}

/** @throws HttpError 401 with the same message whether the email or the password is wrong. */
async function login(email: string, password: string, client: ClientInfo): Promise<AdminSession> {
  const admin = await adminAuthRepository.findByEmail(email);
  // Unknown emails still run a real hash check. Legacy costs can be faster until the next
  // successful login upgrades them, so this is not a constant-time account-existence guarantee.
  const valid = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !valid) throw HttpError.unauthorized('Email hoặc mật khẩu không đúng.');

  // Do expensive hashing before taking the account lock, then recheck the verified snapshot.
  const upgradedHash = needsPasswordRehash(admin.password_hash) ? await hashPassword(password) : undefined;
  return withTransaction(async (db) => {
    const current = await adminAuthRepository.findById(admin.id, db, true);
    if (!current || current.password_hash !== admin.password_hash) throw credentialsChanged();
    if (upgradedHash) {
      if (!(await adminAuthRepository.upgradePasswordHash(admin.id, admin.password_hash, upgradedHash, db))) {
        throw credentialsChanged();
      }
    }

    // Password changes take the same account lock. Either this session is created first and
    // later revoked, or a changed credential snapshot prevents its creation altogether.
    const token = randomToken();
    const expiresAt = await adminAuthRepository.createSession(
      admin.id,
      sha256Hex(token),
      env.admin.sessionHours,
      client.ip,
      client.userAgent,
      db,
    );
    await adminAuthRepository.recordLogin(admin.id, db);
    return { token, expiresAt: expiresAt.toISOString(), admin: { id: current.id, email: current.email, name: current.name } };
  });
}

/** @returns the admin and session for a live token (marking it used), or undefined. */
async function authenticate(token: string): Promise<{ admin: AdminIdentity; sessionId: string } | undefined> {
  return adminAuthRepository.touchSession(sha256Hex(token), env.admin.idleMinutes);
}

async function logout(token: string): Promise<void> {
  await adminAuthRepository.deleteSession(sha256Hex(token));
}

/** The admin's signed-in devices, the current one marked. */
async function listSessions(admin: AdminIdentity, currentSessionId: string): Promise<AdminSessionInfo[]> {
  return adminAuthRepository.listSessions(admin.id, env.admin.idleMinutes, currentSessionId);
}

/** Signs one of the admin's own devices out (the current one too: that is logging out). */
async function revokeSession(admin: AdminIdentity, sessionId: string): Promise<void> {
  if (!(await adminAuthRepository.deleteOwnSession(admin.id, sessionId))) {
    throw HttpError.notFound('Không tìm thấy phiên đăng nhập.');
  }
}

async function revokeOtherSessions(admin: AdminIdentity, currentToken: string): Promise<void> {
  await adminAuthRepository.deleteOtherSessions(admin.id, sha256Hex(currentToken));
}

function assertStrongPassword(password: string, email: string): void {
  const problem = passwordProblem(password, email);
  if (problem) throw HttpError.validation([{ path: 'newPassword', message: problem }]);
}

/**
 * Changes the password, signs out every other device of this admin, and emails the admin so a
 * change they did not make does not go unnoticed.
 */
async function changePassword(
  admin: AdminIdentity,
  currentToken: string,
  passwords: { currentPassword: string; newPassword: string },
  client: ClientInfo,
): Promise<void> {
  const account = await adminAuthRepository.findById(admin.id);
  if (!account || !(await verifyPassword(passwords.currentPassword, account.password_hash))) {
    throw HttpError.validation([{ path: 'currentPassword', message: 'Mật khẩu hiện tại không đúng.' }]);
  }
  assertStrongPassword(passwords.newPassword, account.email);
  if (await verifyPassword(passwords.newPassword, account.password_hash)) {
    throw HttpError.validation([{ path: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }]);
  }

  const passwordHash = await hashPassword(passwords.newPassword);
  await withTransaction(async (db) => {
    const current = await adminAuthRepository.findById(admin.id, db, true);
    if (!current || current.password_hash !== account.password_hash) throw credentialsChanged();

    await adminAuthRepository.updatePassword(admin.id, passwordHash, db);
    await adminAuthRepository.deleteOtherSessions(admin.id, sha256Hex(currentToken), db);
    await emailService.queueAdminPasswordChanged({ name: current.name, email: current.email, ...client, at: new Date() }, db);
  });
}

/** Used by the `admin:create` command. */
async function createAdmin(email: string, name: string, password: string): Promise<AdminIdentity> {
  assertStrongPassword(password, email);
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
  return adminAuthRepository.deleteExpiredSessions(env.admin.idleMinutes);
}

export const adminAuthService = {
  login,
  authenticate,
  logout,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  changePassword,
  createAdmin,
  purgeExpiredSessions,
};
