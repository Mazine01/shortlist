import { Router, type Response } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { APP_STATUSES, APP_STATUS_LABELS, applicationUpdateSchema, companySchema, jobInputSchema, type Applicant, type AppStatus, type EmployerJob } from '@shortlist/shared';
import { db } from '../../db/index.js';
import { applications, companies, jobs, seekerProfiles, users } from '../../db/schema.js';
import { AppError } from '../../lib/errors.js';
import { brief, jobRows, searchVector, slugify, toJob } from '../../lib/jobs.js';
import { notify } from '../../lib/notify.js';
import { me } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendResume } from '../seeker/seeker.routes.js';

export const employerRouter = Router();
const idParams = z.object({ id: z.coerce.number().int().positive() });

async function myCompany(res: Response) {
  const [c] = await db.select().from(companies).where(eq(companies.ownerId, me(res).id));
  return c ?? null;
}
async function requireCompany(res: Response) {
  const c = await myCompany(res);
  if (!c) throw AppError.badRequest('Set up your company profile first');
  return c;
}

/**
 * The one ownership check every job route goes through: the job must belong to
 * the signed-in employer's company. Anything else is a 404, never a 403.
 */
async function ownJob(res: Response, jobId: number) {
  const c = await requireCompany(res);
  const [row] = await jobRows().where(and(eq(jobs.id, jobId), eq(jobs.companyId, c.id)));
  if (!row) throw AppError.notFound('Job');
  return row;
}

// ---------- Company ----------

employerRouter.get('/company', async (_req, res) => {
  const c = await myCompany(res);
  res.json({ data: c && { ...brief(c), website: c.website, about: c.about, size: c.size } });
});

employerRouter.put('/company', validate(companySchema), async (_req, res) => {
  const b = res.locals.body;
  const values = { name: b.name, slug: slugify(b.name), website: b.website || null, about: b.about, size: b.size };
  const existing = await myCompany(res);
  const [c] = existing
    ? await db.update(companies).set({ ...values, verifiedAt: existing.name === b.name ? existing.verifiedAt : null }).where(eq(companies.id, existing.id)).returning()
    : await db.insert(companies).values({ ...values, ownerId: me(res).id }).returning();
  res.json({ data: { ...brief(c), website: c.website, about: c.about, size: c.size } });
});

// ---------- Jobs ----------

employerRouter.get('/jobs', async (_req, res) => {
  const c = await myCompany(res);
  if (!c) return res.json({ data: [] });
  const rows = await jobRows().where(eq(jobs.companyId, c.id)).orderBy(desc(jobs.updatedAt));
  const counts = await db
    .select({ jobId: applications.jobId, status: applications.status, n: sql<number>`count(*)::int` })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(eq(jobs.companyId, c.id))
    .groupBy(applications.jobId, applications.status);
  const body: EmployerJob[] = rows.map((r) => {
    const cs = Object.fromEntries(APP_STATUSES.map((s) => [s, 0])) as Record<AppStatus, number>;
    for (const x of counts) if (x.jobId === r.j.id) cs[x.status] = x.n;
    return { ...toJob(r), counts: cs, applicationCount: Object.values(cs).reduce((a, b) => a + b, 0) };
  });
  res.json({ data: body });
});

employerRouter.get('/jobs/:id', validate(idParams, 'params'), async (_req, res) => {
  res.json({ data: toJob(await ownJob(res, res.locals.params.id)) });
});

function jobValues(b: z.output<typeof jobInputSchema>) {
  return {
    title: b.title,
    description: b.description,
    remoteType: b.remoteType,
    jobType: b.jobType,
    region: b.region,
    location: b.location || null,
    salaryMin: b.salaryMin ?? null,
    salaryMax: b.salaryMax ?? null,
    currency: b.currency,
    tags: [...new Set(b.tags)],
    status: b.status,
    search: searchVector(b.title, b.tags, b.description),
  };
}

employerRouter.post('/jobs', validate(jobInputSchema), async (_req, res) => {
  const c = await requireCompany(res);
  const b = res.locals.body as z.output<typeof jobInputSchema>;
  const [j] = await db
    .insert(jobs)
    .values({ ...jobValues(b), companyId: c.id, publishedAt: b.status === 'OPEN' ? new Date() : null })
    .returning({ id: jobs.id });
  res.status(201).json({ data: toJob(await ownJob(res, j.id)) });
});

/** Full replace (the editor always sends the whole job). Publishing stamps the date once. */
employerRouter.put('/jobs/:id', validate(idParams, 'params'), validate(jobInputSchema), async (_req, res) => {
  const row = await ownJob(res, res.locals.params.id);
  const b = res.locals.body as z.output<typeof jobInputSchema>;
  await db
    .update(jobs)
    .set({ ...jobValues(b), publishedAt: b.status === 'OPEN' ? (row.j.publishedAt ?? new Date()) : row.j.publishedAt })
    .where(eq(jobs.id, row.j.id));
  res.json({ data: toJob(await ownJob(res, row.j.id)) });
});

employerRouter.delete('/jobs/:id', validate(idParams, 'params'), async (_req, res) => {
  const row = await ownJob(res, res.locals.params.id);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(applications).where(eq(applications.jobId, row.j.id));
  if (n > 0) throw AppError.conflict('This job has applicants. Close it instead of deleting, so their applications stay visible.');
  await db.delete(jobs).where(eq(jobs.id, row.j.id));
  res.status(204).end();
});

// ---------- Applicants ----------

employerRouter.get('/jobs/:id/applicants', validate(idParams, 'params'), async (_req, res) => {
  const row = await ownJob(res, res.locals.params.id);
  const rows = await db
    .select({ a: applications, u: { id: users.id, name: users.name, email: users.email }, p: seekerProfiles })
    .from(applications)
    .innerJoin(users, eq(applications.seekerId, users.id))
    .leftJoin(seekerProfiles, eq(seekerProfiles.userId, users.id))
    .where(eq(applications.jobId, row.j.id))
    .orderBy(applications.createdAt);
  const wanted = new Set(row.j.tags.map((t) => t.toLowerCase()));
  const body: Applicant[] = rows.map(({ a, u, p }) => ({
    id: a.id,
    status: a.status,
    coverNote: a.coverNote,
    employerNote: a.employerNote,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    seeker: { ...u, headline: p?.headline ?? null, location: p?.location ?? null, skills: p?.skills ?? [] },
    hasResume: a.resumeId !== null,
    matchingSkills: (p?.skills ?? []).filter((s) => wanted.has(s.toLowerCase())),
  }));
  res.json({ data: body });
});

/** Moves an applicant through the pipeline and tells them; the private note is never shown to the seeker. */
employerRouter.patch('/applications/:id', validate(idParams, 'params'), validate(applicationUpdateSchema), async (_req, res) => {
  const c = await requireCompany(res);
  const [found] = await db
    .select({ a: applications, j: jobs })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(and(eq(applications.id, res.locals.params.id), eq(jobs.companyId, c.id)));
  if (!found) throw AppError.notFound('Application');
  const { status, employerNote } = res.locals.body as { status?: AppStatus; employerNote?: string };
  await db
    .update(applications)
    .set({ ...(status && { status }), ...(employerNote !== undefined && { employerNote: employerNote || null }) })
    .where(eq(applications.id, found.a.id));
  if (status && status !== found.a.status) {
    await notify(found.a.seekerId, 'STATUS_CHANGED', `${c.name}: your application for ${found.j.title} is now “${APP_STATUS_LABELS[status]}”`, '/me/applications');
  }
  res.json({ ok: true });
});

employerRouter.get('/applications/:id/resume', validate(idParams, 'params'), async (_req, res) => {
  const c = await requireCompany(res);
  const [found] = await db
    .select({ resumeId: applications.resumeId })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(and(eq(applications.id, res.locals.params.id), eq(jobs.companyId, c.id)));
  if (!found?.resumeId) throw AppError.notFound('Resume');
  await sendResume(res, found.resumeId);
});
