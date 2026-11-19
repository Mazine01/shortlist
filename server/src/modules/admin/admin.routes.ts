import { Router } from 'express';
import { and, desc, eq, gte, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ROLES, type AdminStats, type Role } from '@shortlist/shared';
import { db } from '../../db/index.js';
import { applications, companies, jobs, users } from '../../db/schema.js';
import { AppError } from '../../lib/errors.js';
import { brief, jobRows, toJob } from '../../lib/jobs.js';
import { notify } from '../../lib/notify.js';
import { me } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const adminRouter = Router();
const idParams = z.object({ id: z.coerce.number().int().positive() });
const flag = z.object({ value: z.boolean() });

adminRouter.get('/stats', async (_req, res) => {
  const [roles, [open], [week], [unverified]] = await Promise.all([
    db.select({ role: users.role, n: sql<number>`count(*)::int` }).from(users).groupBy(users.role),
    db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(and(eq(jobs.status, 'OPEN'), isNull(jobs.hiddenAt))),
    db.select({ n: sql<number>`count(*)::int` }).from(applications).where(gte(applications.createdAt, new Date(Date.now() - 7 * 864e5))),
    db.select({ n: sql<number>`count(*)::int` }).from(companies).where(isNull(companies.verifiedAt)),
  ]);
  const byRole = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  for (const r of roles) byRole[r.role] = r.n;
  const body: AdminStats = { users: byRole, openJobs: open.n, applicationsThisWeek: week.n, unverifiedCompanies: unverified.n };
  res.json({ data: body });
});

adminRouter.get('/companies', async (_req, res) => {
  const rows = await db
    .select({ c: companies, owner: users.email, jobs: sql<number>`(select count(*)::int from jobs where jobs.company_id = ${companies.id})` })
    .from(companies)
    .innerJoin(users, eq(companies.ownerId, users.id))
    .orderBy(sql`${companies.verifiedAt} is not null`, desc(companies.createdAt));
  res.json({ data: rows.map(({ c, owner, jobs: n }) => ({ ...brief(c), website: c.website, about: c.about, size: c.size, owner, jobCount: n, createdAt: c.createdAt.toISOString() })) });
});

adminRouter.put('/companies/:id/verified', validate(idParams, 'params'), validate(flag), async (_req, res) => {
  const [c] = await db.update(companies).set({ verifiedAt: res.locals.body.value ? new Date() : null }).where(eq(companies.id, res.locals.params.id)).returning();
  if (!c) throw AppError.notFound('Company');
  res.json({ data: brief(c) });
});

adminRouter.get('/jobs', validate(z.object({ q: z.string().trim().max(80).optional(), hidden: z.enum(['1']).optional() }), 'query'), async (_req, res) => {
  const { q, hidden } = res.locals.query;
  const rows = await jobRows()
    .where(and(q ? or(ilike(jobs.title, `%${q.replace(/[\\%_]/g, '\\$&')}%`), ilike(companies.name, `%${q.replace(/[\\%_]/g, '\\$&')}%`)) : undefined, hidden ? sql`${jobs.hiddenAt} is not null` : undefined))
    .orderBy(desc(jobs.createdAt))
    .limit(100);
  res.json({ data: rows.map(toJob) });
});

adminRouter.put('/jobs/:id/hidden', validate(idParams, 'params'), validate(flag), async (_req, res) => {
  const [row] = await jobRows().where(eq(jobs.id, res.locals.params.id));
  if (!row) throw AppError.notFound('Job');
  const hide = res.locals.body.value as boolean;
  await db.update(jobs).set({ hiddenAt: hide ? new Date() : null }).where(eq(jobs.id, row.j.id));
  if (hide && !row.j.hiddenAt) await notify(row.c.ownerId, 'JOB_HIDDEN', `${row.j.title} was hidden by a moderator. Reply to support if you think this is a mistake.`, '/employer');
  res.json({ ok: true });
});

adminRouter.get('/users', validate(z.object({ q: z.string().trim().max(80).optional() }), 'query'), async (_req, res) => {
  const q = res.locals.query.q as string | undefined;
  const pat = q && `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, suspendedAt: users.suspendedAt, createdAt: users.createdAt })
    .from(users)
    .where(pat ? or(ilike(users.name, pat), ilike(users.email, pat)) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(100);
  res.json({ data: rows.map((u) => ({ ...u, suspended: Boolean(u.suspendedAt), createdAt: u.createdAt.toISOString(), suspendedAt: undefined })) });
});

adminRouter.put('/users/:id/suspended', validate(idParams, 'params'), validate(flag), async (_req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, res.locals.params.id));
  if (!u) throw AppError.notFound('User');
  if (u.id === me(res).id) throw AppError.conflict('You can’t suspend your own account');
  if (u.role === 'ADMIN') throw AppError.conflict('Admins can’t be suspended from here');
  await db.update(users).set({ suspendedAt: res.locals.body.value ? new Date() : null }).where(eq(users.id, u.id));
  res.json({ ok: true });
});
