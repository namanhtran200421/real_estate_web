/**
 * Guards every `/api/v1/admin/*` route (except login): requires `Authorization: Bearer <token>`
 * from a live session (not expired, not idle) and exposes the admin as `res.locals.admin` for
 * auditing. Each request counts as activity and keeps the session alive.
 */
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../lib/http-error.js';
import { adminAuthService } from './admin-auth.service.js';
import type { AdminIdentity } from './admin-auth.types.js';

declare global {
  namespace Express {
    interface Locals {
      admin: AdminIdentity;
      adminToken: string;
      adminSessionId: string;
    }
  }
}

export function bearerToken(req: Request): string | undefined {
  const header = req.get('Authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req);
  if (!token) throw HttpError.unauthorized();

  const session = await adminAuthService.authenticate(token);
  if (!session) throw HttpError.unauthorized('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');

  res.locals.admin = session.admin;
  res.locals.adminToken = token;
  res.locals.adminSessionId = session.sessionId;
  // Admin data is private: never let a browser or proxy cache it.
  res.setHeader('Cache-Control', 'no-store');
  next();
}
