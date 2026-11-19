import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { loginSchema, registerSchema, type User } from '@shortlist/shared';
import { db } from '../../db/index.js';
import { companies, seekerProfiles, users } from '../../db/schema.js';
import { AppError } from '../../lib/errors.js';
import { env } from '../../lib/env.js';
import { validate } from '../../middleware/validate.js';
import { clearSessionCookie, me, requireAuth, setSessionCookie } from '../../middleware/auth.js';

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Wait 15 minutes and try again.')),
});
const dummyHash = hash(randomBytes(16).toString('hex'));

export async function publicUser(id: number): Promise<User> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  const [[p], [c]] = await Promise.all([
    db.select({ id: seekerProfiles.userId }).from(seekerProfiles).where(eq(seekerProfiles.userId, id)),
    db.select({ id: companies.id }).from(companies).where(eq(companies.ownerId, id)),
  ]);
  return { id: u.id, name: u.name, email: u.email, role: u.role, hasProfile: Boolean(p), hasCompany: Boolean(c) };
}

authRouter.post('/register', limiter, validate(registerSchema), async (_req, res) => {
  const { name, email, password, role } = res.locals.body;
  const [u] = await db.insert(users).values({ name, email, role, passwordHash: await hash(password) }).returning({ id: users.id });
  setSessionCookie(res, u);
  res.status(201).json({ user: await publicUser(u.id) });
});

authRouter.post('/login', limiter, validate(loginSchema), async (_req, res) => {
  const { email, password } = res.locals.body;
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ok = await verify(u?.passwordHash ?? (await dummyHash), password).catch(() => false);
  if (!u || !ok) throw AppError.unauthorized('Email or password is incorrect');
  if (u.suspendedAt) throw AppError.forbidden('This account is suspended. Contact support.');
  setSessionCookie(res, u);
  res.json({ user: await publicUser(u.id) });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (_req, res) => {
  res.json({ user: await publicUser(me(res).id) });
});
