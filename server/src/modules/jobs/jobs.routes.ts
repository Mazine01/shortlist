import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { jobSearchSchema } from '@shortlist/shared';
import { db } from '../../db/index.js';
import { companies, jobs } from '../../db/schema.js';
import { AppError } from '../../lib/errors.js';
import { brief, isPublic, jobRows, markForSeeker, searchJobs, toCard, toJob } from '../../lib/jobs.js';
import { maybeMe, optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const jobsRouter = Router();

jobsRouter.get('/jobs', optionalAuth, validate(jobSearchSchema, 'query'), async (_req, res) => {
  const q = res.locals.query;
  const { rows, total, tookMs } = await searchJobs(q);
  const viewer = maybeMe(res);
  const cards = await markForSeeker(rows.map(toCard), viewer?.role === 'SEEKER' ? viewer.id : undefined);
  res.json({ data: cards, meta: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)), tookMs } });
});

/** Most-used tags across open jobs, for the filter chips. */
jobsRouter.get('/tags', async (_req, res) => {
  const rows = await db.execute<{ tag: string; n: number }>(sql`
    select t.tag, count(*)::int as n from jobs, unnest(jobs.tags) as t(tag)
    where jobs.status = 'OPEN' and jobs.hidden_at is null
    group by t.tag order by n desc, t.tag limit 16`);
  res.json({ data: rows.rows });
});

/** Public detail. The owner and admins may also open drafts, closed and hidden posts. */
jobsRouter.get('/jobs/:id', optionalAuth, validate(z.object({ id: z.coerce.number().int().positive() }), 'params'), async (_req, res) => {
  const viewer = maybeMe(res);
  const [row] = await jobRows().where(eq(jobs.id, res.locals.params.id));
  if (!row) throw AppError.notFound('Job');
  const canSeeAnyway = viewer && (viewer.role === 'ADMIN' || row.c.ownerId === viewer.id);
  const [visible] = await jobRows().where(and(eq(jobs.id, row.j.id), isPublic));
  if (!visible && !canSeeAnyway) throw AppError.notFound('Job');
  const [card] = await markForSeeker([toCard(row)], viewer?.role === 'SEEKER' ? viewer.id : undefined);
  res.json({ data: { ...toJob(row), saved: card.saved, applied: card.applied } });
});

jobsRouter.get('/companies/:slug', validate(z.object({ slug: z.string().max(80) }), 'params'), async (_req, res) => {
  const [c] = await db.select().from(companies).where(eq(companies.slug, res.locals.params.slug));
  if (!c) throw AppError.notFound('Company');
  const open = await jobRows()
    .where(and(eq(jobs.companyId, c.id), isPublic))
    .orderBy(desc(jobs.publishedAt));
  res.json({ data: { ...brief(c), website: c.website, about: c.about, size: c.size, openJobs: open.length }, jobs: open.map(toCard) });
});
