import type { RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { Role } from '@shortlist/shared';
import { env, isProd } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

export const AUTH_COOKIE = 'shortlist_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  role: Role;
}

const cookieOptions = () => ({ httpOnly: true, secure: isProd || env.COOKIE_SAMESITE === 'none', sameSite: env.COOKIE_SAMESITE, path: '/' });

export function setSessionCookie(res: Response, user: { id: number }) {
  const token = jwt.sign({ sub: String(user.id) }, env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
}

/** Reads the session if there is one. Role and suspension are loaded fresh from the database. */
async function loadUser(token: string | undefined): Promise<SessionUser | 'expired' | 'suspended' | null> {
  if (!token) return null;
  let id: number;
  try {
    id = Number((jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload).sub);
  } catch {
    return 'expired';
  }
  const [u] = await db.select({ id: users.id, role: users.role, suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, id));
  if (!u) return 'expired';
  if (u.suspendedAt) return 'suspended';
  return { id: u.id, role: u.role };
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const u = await loadUser(req.cookies?.[AUTH_COOKIE]);
    if (u === 'suspended') return next(AppError.forbidden('This account is suspended. Contact support.'));
    if (u === 'expired') return next(AppError.unauthorized('Your session has expired. Sign in again.'));
    if (!u) return next(AppError.unauthorized());
    res.locals.user = u;
    next();
  } catch (e) {
    next(e);
  }
};

/** For public pages that show a little more to signed-in people (saved / applied markers). */
export const optionalAuth: RequestHandler = async (req, res, next) => {
  try {
    const u = await loadUser(req.cookies?.[AUTH_COOKIE]);
    if (u && typeof u === 'object') res.locals.user = u;
    next();
  } catch (e) {
    next(e);
  }
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (_req, res, next) => {
    const u = res.locals.user as SessionUser | undefined;
    if (!u || !roles.includes(u.role)) return next(AppError.forbidden());
    next();
  };

export const me = (res: Response) => res.locals.user as SessionUser;
export const maybeMe = (res: Response) => res.locals.user as SessionUser | undefined;
