import express, { Router, type Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { applySchema, MAX_RESUME_BYTES, profileSchema, type MyApplication, type SeekerProfile } from '@shortlist/shared';
import { db } from '../../db/index.js';
import { applications, companies, jobs, resumes, savedJobs, seekerProfiles } from '../../db/schema.js';
import { AppError } from '../../lib/errors.js';
import { isPublic, jobRows, toCard } from '../../lib/jobs.js';
import { notify } from '../../lib/notify.js';
import { me } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const seekerRouter = Router();
const jobParams = z.object({ jobId: z.coerce.number().int().positive() });

async function latestResume(userId: number) {
  const [r] = await db
    .select({ id: resumes.id, filename: resumes.filename, size: resumes.size, uploadedAt: resumes.uploadedAt })
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.uploadedAt), desc(resumes.id))
    .limit(1);
  return r ?? null;
}

/** Sends a stored PDF so the browser can't treat it as a web page. */
export async function sendResume(res: Response, resumeId: number) {
  const [r] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
  if (!r) throw AppError.notFound('Resume');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${r.filename.replace(/[^\w.-]/g, '_')}"`);
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(r.data);
}

seekerRouter.get('/profile', async (_req, res) => {
  const [p] = await db.select().from(seekerProfiles).where(eq(seekerProfiles.userId, me(res).id));
  const r = await latestResume(me(res).id);
  const body: SeekerProfile | null = p
    ? { headline: p.headline, location: p.location, region: p.region, skills: p.skills, about: p.about, resume: r && { name: r.filename, size: r.size, uploadedAt: r.uploadedAt.toISOString() } }
    : null;
  res.json({ data: body, resume: r && { name: r.filename, size: r.size, uploadedAt: r.uploadedAt.toISOString() } });
});

seekerRouter.put('/profile', validate(profileSchema), async (_req, res) => {
  const b = res.locals.body;
  const values = { headline: b.headline, location: b.location, region: b.region, skills: [...new Set(b.skills.map((s: string) => s.toLowerCase()))] as string[], about: b.about || null };
  await db
    .insert(seekerProfiles)
    .values({ userId: me(res).id, ...values })
    .onConflictDoUpdate({ target: seekerProfiles.userId, set: values });
  res.json({ ok: true });
});

/**
 * PDF upload as the raw request body (no multipart parser needed). The bytes must
 * start with %PDF- whatever the client claims the type is; size is capped at 5 MB.
 */
seekerRouter.put(
  '/resume',
  express.raw({ type: () => true, limit: MAX_RESUME_BYTES }),
  async (req, res) => {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw AppError.badRequest('Choose a PDF file to upload');
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw AppError.badRequest('That file isn’t a PDF. Export your resume as PDF and try again.');
    const raw = String(req.header('x-filename') ?? 'resume.pdf');
    const filename = (decodeURIComponent(raw).replace(/[^\w .()-]/g, '').slice(0, 80) || 'resume') .replace(/(\.pdf)?$/i, '.pdf');
    const [r] = await db.insert(resumes).values({ userId: me(res).id, filename, size: buf.length, data: buf }).returning({ id: resumes.id, filename: resumes.filename, size: resumes.size, uploadedAt: resumes.uploadedAt });
    res.status(201).json({ data: { name: r.filename, size: r.size, uploadedAt: r.uploadedAt.toISOString() } });
  },
);

seekerRouter.get('/resume', async (_req, res) => {
  const r = await latestResume(me(res).id);
  if (!r) throw AppError.notFound('Resume');
  await sendResume(res, r.id);
});

seekerRouter.post('/jobs/:jobId/apply', validate(jobParams, 'params'), validate(applySchema), async (_req, res) => {
  const seekerId = me(res).id;
  const [row] = await jobRows().where(and(eq(jobs.id, res.locals.params.jobId), isPublic));
  if (!row) throw AppError.notFound('Job');
  const [profile] = await db.select({ id: seekerProfiles.userId }).from(seekerProfiles).where(eq(seekerProfiles.userId, seekerId));
  if (!profile) throw AppError.badRequest('Add your headline and skills to your profile before applying');
  const resume = await latestResume(seekerId);
  if (!resume) throw AppError.badRequest('Upload your resume (PDF) before applying');

  const [app] = await db
    .insert(applications)
    .values({ jobId: row.j.id, seekerId, resumeId: resume.id, coverNote: res.locals.body.coverNote || null })
    .returning();
  await notify(row.c.ownerId, 'APPLICATION_RECEIVED', `New applicant for ${row.j.title}`, `/employer/jobs/${row.j.id}`);
  res.status(201).json({ data: { id: app.id, status: app.status } });
});

seekerRouter.get('/applications', async (_req, res) => {
  const rows = await db
    .select({ a: applications, j: jobs, c: companies })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(applications.seekerId, me(res).id))
    .orderBy(desc(applications.updatedAt));
  const body: MyApplication[] = rows.map(({ a, j, c }) => ({
    id: a.id,
    status: a.status,
    coverNote: a.coverNote,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    job: { ...toCard({ j, c }), status: j.hiddenAt ? 'CLOSED' : j.status },
  }));
  res.json({ data: body });
});

/** Withdrawing is allowed until the employer has made an offer. */
seekerRouter.delete('/applications/:id', validate(z.object({ id: z.coerce.number().int().positive() }), 'params'), async (_req, res) => {
  const [a] = await db.select().from(applications).where(and(eq(applications.id, res.locals.params.id), eq(applications.seekerId, me(res).id)));
  if (!a) throw AppError.notFound('Application');
  if (a.status === 'OFFER') throw AppError.conflict('You have an offer for this job. Reply to the employer directly.');
  await db.delete(applications).where(eq(applications.id, a.id));
  res.status(204).end();
});

seekerRouter.get('/saved', async (_req, res) => {
  const rows = await jobRows()
    .innerJoin(savedJobs, eq(savedJobs.jobId, jobs.id))
    .where(and(eq(savedJobs.seekerId, me(res).id), isPublic))
    .orderBy(desc(savedJobs.savedAt));
  res.json({ data: rows.map((r) => ({ ...toCard(r), saved: true })) });
});

seekerRouter.put('/saved/:jobId', validate(jobParams, 'params'), async (_req, res) => {
  const [row] = await jobRows().where(and(eq(jobs.id, res.locals.params.jobId), isPublic));
  if (!row) throw AppError.notFound('Job');
  await db.insert(savedJobs).values({ seekerId: me(res).id, jobId: row.j.id }).onConflictDoNothing();
  res.status(204).end();
});

seekerRouter.delete('/saved/:jobId', validate(jobParams, 'params'), async (_req, res) => {
  await db.delete(savedJobs).where(and(eq(savedJobs.seekerId, me(res).id), eq(savedJobs.jobId, res.locals.params.jobId)));
  res.status(204).end();
});
