CREATE TYPE "public"."application_status" AS ENUM('APPLIED', 'REVIEWING', 'INTERVIEW', 'OFFER', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('WORLDWIDE', 'EUROPE', 'AMERICAS', 'ASIA_PACIFIC', 'MENA');--> statement-breakpoint
CREATE TYPE "public"."remote_type" AS ENUM('REMOTE', 'HYBRID', 'ONSITE');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('SEEKER', 'EMPLOYER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"seeker_id" integer NOT NULL,
	"resume_id" integer,
	"cover_note" text,
	"status" "application_status" DEFAULT 'APPLIED' NOT NULL,
	"employer_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_job_seeker_unique" UNIQUE("job_id","seeker_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text,
	"about" text NOT NULL,
	"size" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_owner_unique" UNIQUE("owner_id"),
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"remote_type" "remote_type" NOT NULL,
	"job_type" "job_type" NOT NULL,
	"region" "region" NOT NULL,
	"location" text,
	"salary_min" integer,
	"salary_max" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"status" "job_status" DEFAULT 'DRAFT' NOT NULL,
	"hidden_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"search" "tsvector" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"link" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_jobs" (
	"seeker_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_jobs_seeker_id_job_id_pk" PRIMARY KEY("seeker_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "seeker_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"location" text NOT NULL,
	"region" "region" NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"about" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD CONSTRAINT "seeker_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_seeker_idx" ON "applications" USING btree ("seeker_id");--> statement-breakpoint
CREATE INDEX "jobs_search_gin" ON "jobs" USING gin ("search");--> statement-breakpoint
CREATE INDEX "jobs_tags_gin" ON "jobs" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "jobs_public_idx" ON "jobs" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");