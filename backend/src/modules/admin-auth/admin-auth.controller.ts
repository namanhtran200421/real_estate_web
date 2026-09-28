/**
 * Admin login, logout and account handlers.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { email, parse } from '../../lib/validation.js';
import { adminAuthService } from './admin-auth.service.js';

const loginBody = z.object({ email, password: z.string().min(1).max(200) });
const passwordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(200) });

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

/** POST /admin/auth/password */
async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = parse(passwordBody, req.body);
  await adminAuthService.changePassword(res.locals.admin, res.locals.adminToken, currentPassword, newPassword);
  res.status(204).end();
}

export const adminAuthController = { login, logout, me, changePassword };
