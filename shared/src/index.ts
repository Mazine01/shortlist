import { z } from 'zod';

// ---------- Constants ----------

export const ROLES = ['SEEKER', 'EMPLOYER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const REMOTE_TYPES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;
export type RemoteType = (typeof REMOTE_TYPES)[number];
export const REMOTE_LABELS: Record<RemoteType, string> = { REMOTE: 'Remote', HYBRID: 'Hybrid', ONSITE: 'On-site' };

export const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const JOB_TYPE_LABELS: Record<JobType, string> = { FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract', INTERNSHIP: 'Internship' };

/** Where a remote team is willing to hire from. Async teams care about this more than a city. */
export const REGIONS = ['WORLDWIDE', 'EUROPE', 'AMERICAS', 'ASIA_PACIFIC', 'MENA'] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABELS: Record<Region, string> = {
  WORLDWIDE: 'Anywhere',
  EUROPE: 'Europe',
  AMERICAS: 'Americas',
  ASIA_PACIFIC: 'Asia-Pacific',
  MENA: 'Middle East & Africa',
};

export const JOB_STATUSES = ['DRAFT', 'OPEN', 'CLOSED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** The hiring pipeline, in order. Rejected sits outside the flow. */
export const APP_STATUSES = ['APPLIED', 'REVIEWING', 'INTERVIEW', 'OFFER', 'REJECTED'] as const;
export type AppStatus = (typeof APP_STATUSES)[number];
export const APP_STATUS_LABELS: Record<AppStatus, string> = {
  APPLIED: 'Applied',
  REVIEWING: 'Reviewing',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Not moving forward',
};

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// ---------- Inputs ----------

const text = (label: string, min: number, max: number) =>
  z.string({ required_error: `${label} is required` }).trim().min(min, min <= 1 ? `${label} is required` : `${label} needs at least ${min} characters`).max(max, `${label} must be ${max} characters or fewer`);

export const registerSchema = z.object({
  name: text('Name', 1, 80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
  /** Only these two can be chosen at sign-up; ADMIN is never accepted here. */
  role: z.enum(['SEEKER', 'EMPLOYER'], { errorMap: () => ({ message: 'Choose job seeker or employer' }) }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const profileSchema = z.object({
  headline: text('Headline', 2, 120),
  location: text('Location', 2, 80),
  region: z.enum(REGIONS),
  skills: z.array(z.string().trim().min(1).max(30)).max(20, 'Up to 20 skills'),
  about: z.string().trim().max(2000).optional().or(z.literal('')),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const companySchema = z.object({
  name: text('Company name', 2, 80),
  website: z.string().trim().url('Enter a full link, like https://example.com').refine((v) => v.startsWith('https://'), 'Use an https:// link').optional().or(z.literal('')),
  about: text('About', 20, 2000),
  size: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']),
});
export type CompanyInput = z.infer<typeof companySchema>;

const money = z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole numbers only').min(0).max(10_000_000);

export const jobInputSchema = z
  .object({
    title: text('Job title', 3, 100),
    description: text('Description', 50, 8000),
    remoteType: z.enum(REMOTE_TYPES),
    jobType: z.enum(JOB_TYPES),
    region: z.enum(REGIONS),
    location: z.string().trim().max(80).optional().or(z.literal('')),
    salaryMin: money.optional().nullable(),
    salaryMax: money.optional().nullable(),
    currency: z.enum(['USD', 'EUR', 'GBP']).default('USD'),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(24)).min(1, 'Add at least one skill tag').max(8, 'Up to 8 tags'),
    status: z.enum(JOB_STATUSES).default('DRAFT'),
  })
  .refine((j) => j.salaryMin == null || j.salaryMax == null || j.salaryMax >= j.salaryMin, {
    message: 'The top of the range must be at least the bottom',
    path: ['salaryMax'],
  })
  .refine((j) => j.remoteType === 'REMOTE' || Boolean(j.location), { message: 'Hybrid and on-site jobs need a location', path: ['location'] });
export type JobInput = z.input<typeof jobInputSchema>;

export const jobSearchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  remote: z.enum(REMOTE_TYPES).optional(),
  type: z.enum(JOB_TYPES).optional(),
  region: z.enum(REGIONS).optional(),
  salary: z.coerce.number().int().min(0).optional(),
  tag: z.string().trim().toLowerCase().max(24).optional(),
  since: z.coerce.number().int().refine((d) => [1, 7, 30].includes(d)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type JobSearch = z.input<typeof jobSearchSchema>;

export const applySchema = z.object({
  coverNote: z.string().trim().max(3000, 'Keep it under 3,000 characters').optional().or(z.literal('')),
});

export const applicationUpdateSchema = z
  .object({
    status: z.enum(APP_STATUSES).optional(),
    employerNote: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.status !== undefined || v.employerNote !== undefined, 'Nothing to update');

// ---------- API shapes ----------

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  hasProfile: boolean;
  hasCompany: boolean;
}

export interface CompanyBrief {
  id: number;
  name: string;
  slug: string;
  verified: boolean;
  initials: string;
  hue: number;
}

export interface Company extends CompanyBrief {
  website: string | null;
  about: string;
  size: string;
  openJobs: number;
}

export interface JobCard {
  id: number;
  title: string;
  company: CompanyBrief;
  remoteType: RemoteType;
  jobType: JobType;
  region: Region;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  tags: string[];
  publishedAt: string | null;
  /** Only on search results with a query: how well it matched (0..1). */
  saved?: boolean;
  applied?: boolean;
}

export interface Job extends JobCard {
  description: string;
  status: JobStatus;
  hidden: boolean;
  companyAbout: string;
  applicationCount?: number;
}

export interface SeekerProfile {
  headline: string;
  location: string;
  region: Region;
  skills: string[];
  about: string | null;
  resume: { name: string; size: number; uploadedAt: string } | null;
}

export interface MyApplication {
  id: number;
  status: AppStatus;
  coverNote: string | null;
  createdAt: string;
  updatedAt: string;
  job: JobCard & { status: JobStatus };
}

export interface Applicant {
  id: number;
  status: AppStatus;
  coverNote: string | null;
  employerNote: string | null;
  createdAt: string;
  updatedAt: string;
  seeker: { id: number; name: string; email: string; headline: string | null; location: string | null; skills: string[] };
  hasResume: boolean;
  matchingSkills: string[];
}

export interface EmployerJob extends Job {
  counts: Record<AppStatus, number>;
}

export interface Notification {
  id: number;
  kind: 'APPLICATION_RECEIVED' | 'STATUS_CHANGED' | 'JOB_HIDDEN';
  text: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface AdminStats {
  users: Record<Role, number>;
  openJobs: number;
  applicationsThisWeek: number;
  unverifiedCompanies: number;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number; tookMs?: number };
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
