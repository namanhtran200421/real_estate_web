/**
 * Guards every `/api/v1/admin/*` route (except login): requires `Authorization: Bearer <token>`
 * from a valid session and exposes the admin as `res.locals.admin` for auditing.
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

  const admin = await adminAuthService.authenticate(token);
  if (!admin) throw HttpError.unauthorized('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');

  res.locals.admin = admin;
  res.locals.adminToken = token;
  // Admin data is private: never let a browser or proxy cache it.
  res.setHeader('Cache-Control', 'no-store');
  next();
}
