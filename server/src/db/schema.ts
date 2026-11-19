import { relations } from 'drizzle-orm';
import { boolean, customType, index, integer, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { APP_STATUSES, JOB_STATUSES, JOB_TYPES, REGIONS, REMOTE_TYPES, ROLES } from '@shortlist/shared';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const roleEnum = pgEnum('role', ROLES);
export const remoteEnum = pgEnum('remote_type', REMOTE_TYPES);
export const jobTypeEnum = pgEnum('job_type', JOB_TYPES);
export const regionEnum = pgEnum('region', REGIONS);
export const jobStatusEnum = pgEnum('job_status', JOB_STATUSES);
export const appStatusEnum = pgEnum('application_status', APP_STATUSES);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique('users_email_unique'),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const seekerProfiles = pgTable('seeker_profiles', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  headline: text('headline').notNull(),
  location: text('location').notNull(),
  region: regionEnum('region').notNull(),
  skills: text('skills').array().notNull().default([]),
  about: text('about'),
});

/** Resumes live in the database, not a public bucket: they are only ever served through an access check. */
export const resumes = pgTable('resumes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  size: integer('size').notNull(),
  data: bytea('data').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id')
    .notNull()
    .unique('companies_owner_unique')
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique('companies_slug_unique'),
  website: text('website'),
  about: text('about').notNull(),
  size: text('size').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable(
  'jobs',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    remoteType: remoteEnum('remote_type').notNull(),
    jobType: jobTypeEnum('job_type').notNull(),
    region: regionEnum('region').notNull(),
    location: text('location'),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    currency: text('currency').notNull().default('USD'),
    tags: text('tags').array().notNull().default([]),
    status: jobStatusEnum('status').notNull().default('DRAFT'),
    /** Set by an admin to pull a post from public view without the employer's say. */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Weighted full-text document: title (A), tags (B), description (C). Written by the app on every save. */
    search: tsvector('search').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index('jobs_search_gin').using('gin', t.search),
    index('jobs_tags_gin').using('gin', t.tags),
    index('jobs_public_idx').on(t.status, t.publishedAt),
    index('jobs_company_idx').on(t.companyId),
  ],
);

export const applications = pgTable(
  'applications',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    seekerId: integer('seeker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The resume as it was when they applied; replacing a resume later doesn't change past applications. */
    resumeId: integer('resume_id').references(() => resumes.id, { onDelete: 'set null' }),
    coverNote: text('cover_note'),
    status: appStatusEnum('status').notNull().default('APPLIED'),
    employerNote: text('employer_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique('applications_job_seeker_unique').on(t.jobId, t.seekerId), index('applications_seeker_idx').on(t.seekerId)],
);

export const savedJobs = pgTable(
  'saved_jobs',
  {
    seekerId: integer('seeker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: integer('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.seekerId, t.jobId] })],
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    text: text('text').notNull(),
    link: text('link').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const jobsRelations = relations(jobs, ({ one }) => ({ company: one(companies, { fields: [jobs.companyId], references: [companies.id] }) }));

export const UNIQUE_CONSTRAINT_FIELDS: Record<string, { field: string; message: string }> = {
  users_email_unique: { field: 'email', message: 'An account with this email already exists' },
  companies_owner_unique: { field: 'name', message: 'You already have a company profile' },
  companies_slug_unique: { field: 'name', message: 'A company with this name is already on Shortlist' },
  applications_job_seeker_unique: { field: 'job', message: 'You already applied to this job' },
};
