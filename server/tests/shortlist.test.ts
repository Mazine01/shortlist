import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, pool } from '../src/db/index.js';
import { companies, jobs, users } from '../src/db/schema.js';
import { searchVector } from '../src/lib/jobs.js';
import { samplePdf } from '../src/lib/pdf.js';

const app = createApp();
const PW = 'long-enough-pw';
const cookie = (r: request.Response) => r.get('Set-Cookie') ?? [];

const job = (over: Record<string, unknown> = {}) => ({
  title: 'SOC Analyst',
  description: 'Triage alerts in Splunk, tune Suricata rules and write incident reports for a remote SOC team.',
  remoteType: 'REMOTE',
  jobType: 'FULL_TIME',
  region: 'WORLDWIDE',
  salaryMin: 40000,
  salaryMax: 60000,
  tags: ['splunk', 'suricata'],
  status: 'OPEN',
  ...over,
});
const company = (name: string) => ({ name, about: 'A company that hires remote security analysts.', size: '11-50' });

let seeker: string[], seeker2: string[], empA: string[], empB: string[], admin: string[];
let jobA: number;

beforeAll(async () => {
  await db.execute(sql`truncate notifications, saved_jobs, applications, resumes, jobs, companies, seeker_profiles, users restart identity cascade`);
  const reg = (email: string, role: string) => request(app).post('/api/auth/register').send({ name: email, email, password: PW, role });
  seeker = cookie(await reg('s1@test.dev', 'SEEKER'));
  seeker2 = cookie(await reg('s2@test.dev', 'SEEKER'));
  empA = cookie(await reg('a@test.dev', 'EMPLOYER'));
  empB = cookie(await reg('b@test.dev', 'EMPLOYER'));
  await db.insert(users).values({ name: 'Admin', email: 'admin@test.dev', passwordHash: await hash(PW), role: 'ADMIN' });
  admin = cookie(await request(app).post('/api/auth/login').send({ email: 'admin@test.dev', password: PW }));

  await request(app).put('/api/employer/company').set('Cookie', empA).send(company('Alpha Security'));
  await request(app).put('/api/employer/company').set('Cookie', empB).send(company('Beta Cloud'));
  jobA = (await request(app).post('/api/employer/jobs').set('Cookie', empA).send(job())).body.data.id;

  for (const c of [seeker, seeker2]) {
    await request(app).put('/api/me/profile').set('Cookie', c).send({ headline: 'Analyst', location: 'Hanoi', region: 'ASIA_PACIFIC', skills: ['Splunk', 'python'] });
    await request(app).put('/api/me/resume').set('Cookie', c).set('Content-Type', 'application/pdf').set('X-Filename', 'cv.pdf').send(samplePdf('Test', 'Analyst'));
  }
});

afterAll(async () => {
  await pool.end();
});

describe('roles', () => {
  it('never creates an admin from sign-up', async () => {
    const r = await request(app).post('/api/auth/register').send({ name: 'Eve', email: 'eve@test.dev', password: PW, role: 'ADMIN' });
    expect(r.status).toBe(400);
  });

  it('keeps each area to its role', async () => {
    expect((await request(app).get('/api/employer/jobs').set('Cookie', seeker)).status).toBe(403);
    expect((await request(app).get('/api/me/applications').set('Cookie', empA)).status).toBe(403);
    expect((await request(app).get('/api/admin/stats').set('Cookie', empA)).status).toBe(403);
    expect((await request(app).get('/api/admin/stats')).status).toBe(401);
  });
});

describe('employer ownership', () => {
  it("hides another company's job and applicants with 404", async () => {
    expect((await request(app).get(`/api/employer/jobs/${jobA}`).set('Cookie', empB)).status).toBe(404);
    expect((await request(app).put(`/api/employer/jobs/${jobA}`).set('Cookie', empB).send(job({ title: 'Hijacked' }))).status).toBe(404);
    expect((await request(app).get(`/api/employer/jobs/${jobA}/applicants`).set('Cookie', empB)).status).toBe(404);
  });

  it('validates the salary range and location', async () => {
    const r = await request(app).post('/api/employer/jobs').set('Cookie', empA).send(job({ salaryMin: 90000, salaryMax: 50000, remoteType: 'ONSITE' }));
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields)).toEqual(expect.arrayContaining(['salaryMax', 'location']));
  });

  it('keeps drafts out of public search and pages', async () => {
    const draft = (await request(app).post('/api/employer/jobs').set('Cookie', empA).send(job({ title: 'Secret draft role', status: 'DRAFT' }))).body.data.id;
    expect((await request(app).get(`/api/jobs/${draft}`)).status).toBe(404);
    expect((await request(app).get(`/api/jobs/${draft}`).set('Cookie', empA)).status).toBe(200);
    expect((await request(app).get('/api/jobs?q=secret draft')).body.meta.total).toBe(0);
  });
});

describe('applying', () => {
  it('rejects a file that is not really a PDF', async () => {
    const r = await request(app).put('/api/me/resume').set('Cookie', seeker).set('Content-Type', 'application/pdf').send(Buffer.from('<script>alert(1)</script>'));
    expect(r.status).toBe(400);
  });

  it('applies once, notifies the employer, and refuses a second application', async () => {
    const first = await request(app).post(`/api/me/jobs/${jobA}/apply`).set('Cookie', seeker).send({ coverNote: 'Hello' });
    expect(first.status).toBe(201);
    const again = await request(app).post(`/api/me/jobs/${jobA}/apply`).set('Cookie', seeker).send({});
    expect(again.status).toBe(409);
    const notes = await request(app).get('/api/notifications').set('Cookie', empA);
    expect(notes.body.unread).toBe(1);
  });

  it('lets only the owning employer open an applicant’s resume', async () => {
    const [app1] = (await request(app).get(`/api/employer/jobs/${jobA}/applicants`).set('Cookie', empA)).body.data;
    expect(app1.matchingSkills).toEqual(['splunk']);
    const ok = await request(app).get(`/api/employer/applications/${app1.id}/resume`).set('Cookie', empA);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('application/pdf');
    expect(ok.headers['content-security-policy']).toMatch(/sandbox/);
    expect((await request(app).get(`/api/employer/applications/${app1.id}/resume`).set('Cookie', empB)).status).toBe(404);
  });

  it('moves the applicant, notifies them, and never shows them the private note', async () => {
    const [a] = (await request(app).get(`/api/employer/jobs/${jobA}/applicants`).set('Cookie', empA)).body.data;
    await request(app).patch(`/api/employer/applications/${a.id}`).set('Cookie', empA).send({ status: 'INTERVIEW', employerNote: 'Strong Splunk answers' });
    const mine = (await request(app).get('/api/me/applications').set('Cookie', seeker)).body.data;
    expect(mine[0].status).toBe('INTERVIEW');
    expect(JSON.stringify(mine)).not.toContain('Strong Splunk answers');
    const notes = await request(app).get('/api/notifications').set('Cookie', seeker);
    expect(notes.body.data[0].text).toMatch(/Interview/);
    expect((await request(app).patch(`/api/employer/applications/${a.id}`).set('Cookie', empB).send({ status: 'REJECTED' })).status).toBe(404);
  });

  it("stops one seeker withdrawing another's application", async () => {
    const [a] = (await request(app).get('/api/me/applications').set('Cookie', seeker)).body.data;
    expect((await request(app).delete(`/api/me/applications/${a.id}`).set('Cookie', seeker2)).status).toBe(404);
  });
});

describe('search', () => {
  beforeAll(async () => {
    const [c] = await db.select().from(companies).limit(1);
    const words = ['React', 'Kubernetes', 'Java', 'Python', 'Go', 'Rust', 'Splunk', 'Terraform'];
    const rows = Array.from({ length: 1000 }, (_, i) => {
      const w = words[i % words.length];
      const title = `${w} Engineer ${i}`;
      const tags = [w.toLowerCase(), 'remote'];
      const description = `We need a ${w} engineer to build reliable systems. Experience with ${words[(i + 3) % words.length]} is a plus. `.repeat(4);
      return { companyId: c.id, title, description, remoteType: 'REMOTE' as const, jobType: 'FULL_TIME' as const, region: 'WORLDWIDE' as const, tags, status: 'OPEN' as const, publishedAt: new Date(Date.now() - i * 6e4), salaryMin: 30000 + (i % 10) * 10000, salaryMax: 50000 + (i % 10) * 10000, search: searchVector(title, tags, description) as never };
    });
    for (let i = 0; i < rows.length; i += 250) await db.insert(jobs).values(rows.slice(i, i + 250));
    await db.execute(sql`analyze jobs`);
  });

  it('ranks title matches above description mentions', async () => {
    const r = await request(app).get('/api/jobs?q=kubernetes&limit=5');
    expect(r.body.data[0].title).toMatch(/^Kubernetes/);
    expect(r.body.meta.total).toBeGreaterThan(125); // titles + description mentions
  });

  it('answers in under 100 ms on 1,000+ jobs', async () => {
    await request(app).get('/api/jobs?q=python engineer'); // warm up
    const r = await request(app).get('/api/jobs?q=python engineer&salary=70000');
    expect(r.body.meta.tookMs).toBeLessThan(100);
    expect(r.body.data.every((j: { salaryMax: number }) => j.salaryMax >= 70000)).toBe(true);
  });

  it('filters by tag', async () => {
    const r = await request(app).get('/api/jobs?tag=rust&limit=50');
    expect(r.body.data.every((j: { tags: string[] }) => j.tags.includes('rust'))).toBe(true);
  });
});

describe('moderation', () => {
  it('hides a job from search when an admin pulls it, and tells the employer', async () => {
    await request(app).put(`/api/admin/jobs/${jobA}/hidden`).set('Cookie', admin).send({ value: true });
    expect((await request(app).get(`/api/jobs/${jobA}`)).status).toBe(404);
    const notes = await request(app).get('/api/notifications').set('Cookie', empA);
    expect(notes.body.data[0].kind).toBe('JOB_HIDDEN');
  });

  it('locks a suspended user out immediately, even with a valid session', async () => {
    const [u] = await db.select().from(users).where(sql`email = 's2@test.dev'`);
    await request(app).put(`/api/admin/users/${u.id}/suspended`).set('Cookie', admin).send({ value: true });
    expect((await request(app).get('/api/auth/me').set('Cookie', seeker2)).status).toBe(403);
    expect((await request(app).post('/api/auth/login').send({ email: 's2@test.dev', password: PW })).status).toBe(403);
  });
});
