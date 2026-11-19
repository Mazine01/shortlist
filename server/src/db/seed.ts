import { faker } from '@faker-js/faker';
import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import type { JobType, Region, RemoteType } from '@shortlist/shared';
import { db, pool } from './index.js';
import { applications, companies, jobs, notifications, resumes, savedJobs, seekerProfiles, users } from './schema.js';
import { searchVector, slugify } from '../lib/jobs.js';
import { samplePdf } from '../lib/pdf.js';

const ROLES_BY_FIELD: { titles: string[]; tags: string[] }[] = [
  { titles: ['SOC Analyst', 'Junior SOC Analyst', 'Security Operations Engineer', 'Detection Engineer', 'Incident Responder'], tags: ['splunk', 'siem', 'suricata', 'zeek', 'incident-response', 'python', 'elk', 'threat-hunting'] },
  { titles: ['Junior Security Engineer', 'Application Security Engineer', 'Cloud Security Engineer', 'Penetration Tester'], tags: ['appsec', 'aws', 'owasp', 'burp-suite', 'python', 'kubernetes', 'active-directory', 'pentesting'] },
  { titles: ['Backend Engineer', 'Node.js Developer', 'Senior Backend Engineer', 'API Engineer'], tags: ['node.js', 'typescript', 'postgresql', 'docker', 'aws', 'redis', 'graphql', 'express'] },
  { titles: ['Full Stack Developer', 'Junior Full Stack Developer', 'Full Stack Engineer (React/Node)'], tags: ['react', 'node.js', 'typescript', 'postgresql', 'tailwind', 'next.js', 'supabase'] },
  { titles: ['Frontend Engineer', 'React Developer', 'Design Engineer'], tags: ['react', 'typescript', 'css', 'accessibility', 'next.js', 'testing'] },
  { titles: ['DevOps Engineer', 'Site Reliability Engineer', 'Platform Engineer'], tags: ['kubernetes', 'terraform', 'aws', 'linux', 'docker', 'observability'] },
  { titles: ['Automation Engineer', 'Workflow Automation Specialist', 'Integration Developer'], tags: ['n8n', 'python', 'apis', 'zapier', 'node.js', 'automation'] },
  { titles: ['Data Analyst', 'Data Engineer', 'Analytics Engineer'], tags: ['sql', 'python', 'dbt', 'postgresql', 'airflow', 'looker'] },
  { titles: ['Java Developer', 'Backend Engineer (Java)', 'Spring Boot Engineer'], tags: ['java', 'spring', 'postgresql', 'kafka', 'microservices'] },
];

const COMPANY_NAMES = [
  'Northwind Security', 'Kestrel Labs', 'Bluefin Data', 'Harbor & Pine', 'Copperline', 'Lumen Grid', 'Tidewater Cloud', 'Quill Systems', 'Atlas Ridge', 'Fernhill Analytics',
  'Brightwater Health', 'Saltmarsh Software', 'Orchard Payments', 'Vantage Point Security', 'Cedar Mesh', 'Ironbark Infra', 'Meridian Ledger', 'Sable Works', 'Polar Signal', 'Juniper Freight',
  'Driftwood Learning', 'Marigold Commerce', 'Granite Peak Labs', 'Silverleaf Insurance', 'Thistle Studio', 'Arcadia Robotics', 'Halcyon Mobile', 'Bramble Data', 'Willow & Stone', 'Redwood Telemetry',
  'Cobalt Shield', 'Larkspur AI', 'Ember Logistics', 'Sundial Travel', 'Pinecrest Media', 'Mosaic Retail', 'Starling Bank Tech', 'Wavecrest Energy', 'Foxglove Health', 'Basalt Security',
];
const ABOUTS = [
  'We build software for {x}. The team is fully remote across {n} countries and works mostly in writing.',
  'A small product company making {x} simpler. We hire for judgement and clear writing, wherever you live.',
  'We help {x} run more safely. Engineers own features end to end, from proposal to production.',
  'Remote-first since day one. We make tools for {x}, and we ship every week.',
];
const DOMAINS = ['logistics teams', 'clinics and hospitals', 'online shops', 'small banks', 'schools', 'security teams', 'travel agencies', 'energy providers', 'insurers', 'media companies'];
const CITIES = ['Lisbon, Portugal', 'Hanoi, Vietnam', 'Casablanca, Morocco', 'Berlin, Germany', 'Toronto, Canada', 'Nairobi, Kenya', 'Warsaw, Poland', 'Manila, Philippines', 'Bogotá, Colombia', 'Cairo, Egypt', 'Dublin, Ireland', 'Kuala Lumpur, Malaysia', 'Austin, USA', 'Tunis, Tunisia'];

const PERKS = ['Fully async: we write things down instead of meeting', 'Home-office budget', 'Learning budget for courses and certifications', 'Flexible hours across time zones', 'Four-week paid leave', 'Equipment of your choice'];

function description(title: string, tags: string[], company: string) {
  return [
    `${company} is hiring a ${title} to join a small, distributed team. You will own real work from your first month and ship it to production.`,
    `What you'll do:\n- Build and maintain systems using ${tags.slice(0, 3).join(', ')}\n- Write clear docs and pull requests your teammates can review asynchronously\n- Work with the team on design reviews, on-call improvements and quality`,
    `What we're looking for:\n- Hands-on experience with ${tags.slice(0, 2).join(' and ')}\n- Comfort working independently and communicating in writing\n- Curiosity, and a habit of leaving things better than you found them`,
    `Why join:\n- ${faker.helpers.arrayElements(PERKS, 3).join('\n- ')}`,
  ].join('\n\n');
}

async function main() {
  faker.seed(42);
  const pw = await hash(process.env.SEED_PASSWORD ?? 'Shortlist!2026');

  await db.execute(sql`truncate notifications, saved_jobs, applications, resumes, jobs, companies, seeker_profiles, users restart identity cascade`);

  const [admin, seeker, employer] = await db
    .insert(users)
    .values([
      { name: 'Shortlist Admin', email: 'admin@shortlist.dev', passwordHash: pw, role: 'ADMIN' },
      { name: 'Amina Benali', email: 'seeker@shortlist.dev', passwordHash: pw, role: 'SEEKER' },
      { name: 'Omar Lahlou', email: 'employer@shortlist.dev', passwordHash: pw, role: 'EMPLOYER' },
    ])
    .returning();

  await db.insert(seekerProfiles).values({
    userId: seeker.id,
    headline: 'Junior SOC analyst and full-stack developer',
    location: 'Hanoi, Vietnam',
    region: 'ASIA_PACIFIC',
    skills: ['splunk', 'suricata', 'zeek', 'python', 'react', 'node.js', 'postgresql', 'linux'],
    about: 'CS graduate. I triage alerts, write detections and build the tools I wish I had.',
  });
  await db.insert(resumes).values({ userId: seeker.id, filename: 'Amina-Benali-resume.pdf', size: 0, data: samplePdf('Amina Benali', 'Junior SOC analyst') });
  await db.execute(sql`update resumes set size = length(data)`);

  // Employers: the demo one plus 39 others, each with a company.
  const otherEmployers = await db
    .insert(users)
    .values(Array.from({ length: 39 }, (_, i) => ({ name: `${faker.person.firstName()} ${faker.person.lastName()}`, email: `employer${i + 1}@shortlist.dev`, passwordHash: pw, role: 'EMPLOYER' as const })))
    .returning();
  const companyNames = COMPANY_NAMES;
  const owners = [employer, ...otherEmployers];
  const cs = await db
    .insert(companies)
    .values(
      owners.map((o, i) => ({
        ownerId: o.id,
        name: companyNames[i],
        slug: slugify(companyNames[i]),
        website: `https://${slugify(companyNames[i])}.example.com`,
        about: i === 0 ? 'Northwind Security runs a 24/7 remote SOC for small and mid-sized companies. We are 40 people across 14 countries, and we work asynchronously.' : faker.helpers.arrayElement(ABOUTS).replace('{x}', faker.helpers.arrayElement(DOMAINS)).replace('{n}', String(faker.number.int({ min: 4, max: 22 }))),
        size: faker.helpers.arrayElement(['1-10', '11-50', '51-200', '201-1000']),
        verifiedAt: i % 7 === 3 ? null : new Date(),
      })),
    )
    .returning();

  // 1,000 jobs spread over the last 60 days.
  const rows: (typeof jobs.$inferInsert)[] = [];
  for (let i = 0; i < 1000; i++) {
    const company = i < 6 ? cs[0] : faker.helpers.arrayElement(cs.slice(1));
    const field = i < 6 ? ROLES_BY_FIELD[i % 2] : faker.helpers.arrayElement(ROLES_BY_FIELD);
    const title = faker.helpers.arrayElement(field.titles);
    const tags = faker.helpers.arrayElements(field.tags, { min: 3, max: 5 });
    const remoteType: RemoteType = faker.helpers.weightedArrayElement([{ value: 'REMOTE', weight: 7 }, { value: 'HYBRID', weight: 2 }, { value: 'ONSITE', weight: 1 }]);
    const jobType: JobType = faker.helpers.weightedArrayElement([{ value: 'FULL_TIME', weight: 7 }, { value: 'CONTRACT', weight: 2 }, { value: 'PART_TIME', weight: 1 }, { value: 'INTERNSHIP', weight: 1 }]);
    const region: Region = faker.helpers.arrayElement(['WORLDWIDE', 'WORLDWIDE', 'EUROPE', 'AMERICAS', 'ASIA_PACIFIC', 'MENA']);
    const base = title.includes('Senior') ? 90 : title.includes('Junior') || jobType === 'INTERNSHIP' ? 30 : 55;
    const salaryMin = faker.datatype.boolean(0.8) ? (base + faker.number.int({ min: 0, max: 25 })) * 1000 : null;
    const desc = description(title, tags, company.name);
    const status = i < 6 ? (i === 5 ? 'DRAFT' : 'OPEN') : faker.helpers.weightedArrayElement([{ value: 'OPEN' as const, weight: 9 }, { value: 'CLOSED' as const, weight: 1 }]);
    rows.push({
      companyId: company.id,
      title,
      description: desc,
      remoteType,
      jobType,
      region,
      location: remoteType === 'REMOTE' ? null : faker.helpers.arrayElement(CITIES),
      salaryMin,
      salaryMax: salaryMin ? salaryMin + faker.number.int({ min: 10, max: 35 }) * 1000 : null,
      currency: 'USD',
      tags,
      status,
      publishedAt: status === 'DRAFT' ? null : new Date(Date.now() - (i < 6 ? i * 864e5 : faker.number.int({ min: 0, max: 60 * 24 }) * 36e5)),
      search: searchVector(title, tags, desc) as never,
    });
  }
  for (let i = 0; i < rows.length; i += 200) await db.insert(jobs).values(rows.slice(i, i + 200));

  // Applicants for Northwind's open jobs, at every stage, so the pipeline board has something on it.
  const northwindJobs = await db.select().from(jobs).where(sql`${jobs.companyId} = ${cs[0].id} and ${jobs.status} = 'OPEN'`).orderBy(jobs.id);
  const applicants = await db
    .insert(users)
    .values(Array.from({ length: 14 }, (_, i) => ({ name: `${faker.person.firstName()} ${faker.person.lastName()}`, email: `seeker${i + 1}@shortlist.dev`, passwordHash: pw, role: 'SEEKER' as const })))
    .returning();
  const stages = ['APPLIED', 'APPLIED', 'APPLIED', 'REVIEWING', 'REVIEWING', 'INTERVIEW', 'INTERVIEW', 'OFFER', 'REJECTED'] as const;
  for (const [i, a] of applicants.entries()) {
    const skills = faker.helpers.arrayElements(ROLES_BY_FIELD[i % 2].tags, { min: 3, max: 6 });
    await db.insert(seekerProfiles).values({ userId: a.id, headline: faker.helpers.arrayElement(['SOC analyst', 'Security engineer', 'Blue team analyst', 'IT support moving into security', 'Pentester']), location: faker.helpers.arrayElement(CITIES), region: faker.helpers.arrayElement(['EUROPE', 'AMERICAS', 'ASIA_PACIFIC', 'MENA']), skills });
    const [r] = await db.insert(resumes).values({ userId: a.id, filename: `${a.name.replace(/\s+/g, '-')}.pdf`, size: 0, data: samplePdf(a.name, 'Security analyst') }).returning();
    const job = northwindJobs[i % 3];
    await db.insert(applications).values({
      jobId: job.id,
      seekerId: a.id,
      resumeId: r.id,
      status: stages[i % stages.length],
      coverNote: faker.helpers.maybe(() => faker.helpers.arrayElement(['I have run alert triage in Splunk for two years and want to work on a team that writes things down.', 'Your blog post on tuning Suricata rules is why I applied. I would love to help with detection quality.', 'I am moving from IT support into security and have built a home lab with Security Onion and an AD domain.', 'Async work suits me: I write clear incident notes and handovers.']), { probability: 0.7 }) ?? null,
      createdAt: new Date(Date.now() - faker.number.int({ min: 1, max: 9 }) * 864e5),
    });
  }
  await db.execute(sql`update resumes set size = length(data)`);

  // The demo seeker has applied to two Northwind jobs and saved a few others.
  await db.insert(applications).values([
    { jobId: northwindJobs[0].id, seekerId: seeker.id, resumeId: 1, status: 'INTERVIEW', coverNote: 'I have triaged phishing and firewall alerts in Splunk and Security Onion and would love to do it for real.' },
    { jobId: northwindJobs[2].id, seekerId: seeker.id, resumeId: 1, status: 'APPLIED' },
  ]);
  const some = await db.select({ id: jobs.id }).from(jobs).where(sql`${jobs.status} = 'OPEN' and ${jobs.companyId} <> ${cs[0].id}`).limit(3);
  await db.insert(savedJobs).values(some.map((j) => ({ seekerId: seeker.id, jobId: j.id })));
  await db.insert(notifications).values([
    { userId: seeker.id, kind: 'STATUS_CHANGED', text: `Northwind Security: your application for ${northwindJobs[0].title} is now “Interview”`, link: '/me/applications' },
    { userId: employer.id, kind: 'APPLICATION_RECEIVED', text: `New applicant for ${northwindJobs[2].title}`, link: `/employer/jobs/${northwindJobs[2].id}` },
  ]);

  console.log(`Seeded 1000 jobs, ${cs.length} companies, ${applicants.length + 1} seekers. Logins: ${admin.email}, ${seeker.email}, ${employer.email} (password Shortlist!2026).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
