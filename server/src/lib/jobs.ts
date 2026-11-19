import { and, desc, eq, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { CompanyBrief, Job, JobCard, jobSearchSchema } from '@shortlist/shared';
import type { z } from 'zod';
import { db } from '../db/index.js';
import { applications, companies, jobs, savedJobs, users } from '../db/schema.js';

/** A stable colour per company, so a logo-less company still has a recognisable mark. */
export function brief(c: typeof companies.$inferSelect): CompanyBrief {
  const words = c.name.split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : c.name.slice(0, 2)).toUpperCase();
  let h = 0;
  for (const ch of c.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { id: c.id, name: c.name, slug: c.slug, verified: Boolean(c.verifiedAt), initials, hue: h };
}

export const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Weighted search document. Title matches count most, then tags, then the description. */
export const searchVector = (title: string, tags: string[], description: string) =>
  sql`setweight(to_tsvector('english', ${title}), 'A') || setweight(to_tsvector('english', ${tags.join(' ')}), 'B') || setweight(to_tsvector('english', ${description}), 'C')`;

type Row = { j: typeof jobs.$inferSelect; c: typeof companies.$inferSelect };

export const toCard = ({ j, c }: Row): JobCard => ({
  id: j.id,
  title: j.title,
  company: brief(c),
  remoteType: j.remoteType,
  jobType: j.jobType,
  region: j.region,
  location: j.location,
  salaryMin: j.salaryMin,
  salaryMax: j.salaryMax,
  currency: j.currency,
  tags: j.tags,
  publishedAt: j.publishedAt?.toISOString() ?? null,
});

export const toJob = (r: Row): Job => ({
  ...toCard(r),
  description: r.j.description,
  status: r.j.status,
  hidden: Boolean(r.j.hiddenAt),
  companyAbout: r.c.about,
});

/** Everything the public may see: open, not pulled by an admin, posted by an active account. */
export const isPublic = and(eq(jobs.status, 'OPEN'), isNull(jobs.hiddenAt), isNull(users.suspendedAt));

export const jobRows = () =>
  db.select({ j: jobs, c: companies }).from(jobs).innerJoin(companies, eq(jobs.companyId, companies.id)).innerJoin(users, eq(companies.ownerId, users.id));

export async function searchJobs(q: z.output<typeof jobSearchSchema>) {
  const started = performance.now();
  const parts: (SQL | undefined)[] = [isPublic];
  const query = q.q ? sql`websearch_to_tsquery('english', ${q.q})` : null;
  if (query) parts.push(sql`${jobs.search} @@ ${query}`);
  if (q.remote) parts.push(eq(jobs.remoteType, q.remote));
  if (q.type) parts.push(eq(jobs.jobType, q.type));
  if (q.region) parts.push(q.region === 'WORLDWIDE' ? eq(jobs.region, 'WORLDWIDE') : inArray(jobs.region, [q.region, 'WORLDWIDE']));
  if (q.salary) parts.push(gte(jobs.salaryMax, q.salary));
  if (q.tag) parts.push(sql`${jobs.tags} @> ARRAY[${q.tag}]::text[]`);
  if (q.since) parts.push(gte(jobs.publishedAt, new Date(Date.now() - q.since * 864e5)));
  const where = and(...parts);

  const order = query ? [sql`ts_rank_cd(${jobs.search}, ${query}) desc`, desc(jobs.publishedAt)] : [desc(jobs.publishedAt), desc(jobs.id)];

  const [rows, [{ total }]] = await Promise.all([
    jobRows()
      .where(where)
      .orderBy(...order)
      .limit(q.limit)
      .offset((q.page - 1) * q.limit),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .innerJoin(users, eq(companies.ownerId, users.id))
      .where(where),
  ]);
  return { rows, total, tookMs: Math.round((performance.now() - started) * 10) / 10 };
}

/** Adds saved / applied markers for a signed-in seeker. */
export async function markForSeeker(cards: JobCard[], seekerId: number | undefined) {
  if (!seekerId || !cards.length) return cards;
  const ids = cards.map((c) => c.id);
  const [saved, applied] = await Promise.all([
    db.select({ id: savedJobs.jobId }).from(savedJobs).where(and(eq(savedJobs.seekerId, seekerId), inArray(savedJobs.jobId, ids))),
    db.select({ id: applications.jobId }).from(applications).where(and(eq(applications.seekerId, seekerId), inArray(applications.jobId, ids))),
  ]);
  const s = new Set(saved.map((r) => r.id));
  const a = new Set(applied.map((r) => r.id));
  return cards.map((c) => ({ ...c, saved: s.has(c.id), applied: a.has(c.id) }));
}
