/**
 * Admin login, logout and account handlers.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { email, parse } from '../../lib/validation.js';
import { adminAuthService } from './admin-auth.service.js';

const loginBody = z.object({ email, password: z.string().min(1).max(200) });
// Length and strength rules are checked by the service, so the reason reaches the form.
const passwordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(1_000) });

/** POST /admin/auth/login */
async function login(req: Request, res: Response): Promise<void> {
  const { email: address, password } = parse(loginBody, req.body);
  const session = await adminAuthService.login(address, password, { ip: req.ip, userAgent: req.get('User-Agent') });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: session });
}

/** POST /admin/auth/logout */
async function logout(_req: Request, res: Response): Promise<void> {
  await adminAuthService.logout(res.locals.adminToken);
  res.status(204).end();
}

/** GET /admin/auth/me */
function me(_req: Request, res: Response): void {
  res.json({ data: res.locals.admin });
}

/** POST /admin/auth/password { currentPassword, newPassword } — signs out every other device */
async function changePassword(req: Request, res: Response): Promise<void> {
  const passwords = parse(passwordBody, req.body);
  await adminAuthService.changePassword(res.locals.admin, res.locals.adminToken, passwords, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  res.status(204).end();
}

/** GET /admin/auth/sessions — signed-in devices */
async function sessions(_req: Request, res: Response): Promise<void> {
  res.json({ data: await adminAuthService.listSessions(res.locals.admin, res.locals.adminSessionId) });
}

/** DELETE /admin/auth/sessions/:id — signs that device out */
async function revokeSession(req: Request<{ id: string }>, res: Response): Promise<void> {
  await adminAuthService.revokeSession(res.locals.admin, parse(z.uuid(), req.params.id));
  res.status(204).end();
}

/** POST /admin/auth/sessions/revoke-others — signs out every device but this one */
async function revokeOtherSessions(_req: Request, res: Response): Promise<void> {
  await adminAuthService.revokeOtherSessions(res.locals.admin, res.locals.adminToken);
  res.status(204).end();
}

export const adminAuthController = { login, logout, me, changePassword, sessions, revokeSession, revokeOtherSessions };
