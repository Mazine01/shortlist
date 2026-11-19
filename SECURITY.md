# Security notes

A job board holds people's resumes and their job hunt, which is often confidential. Three roles share one database, so every route is checked for **who** is asking, not just **whether** they are signed in.

| Risk | What Roster does | Where |
| --- | --- | --- |
| Stolen passwords | Passwords are hashed with **argon2id**, never stored or logged in plain text. | `auth.routes.ts` |
| Password guessing | Login is **rate-limited** to 10 attempts per 15 minutes per IP. | `auth.routes.ts` |
| Account discovery | Wrong password and unknown email return the **same message and take the same time**, because a dummy hash is checked when the email does not exist. | `auth.routes.ts` |
| Token theft via XSS | The session JWT lives in an **httpOnly** cookie that JavaScript cannot read. It is Secure in production and expires after 7 days. | `middleware/auth.ts` |
| CSRF | The cookie is **SameSite=Lax** locally. In production (cross-site) it is SameSite=None + Secure, combined with a strict **CORS allowlist** and JSON-only bodies. | `app.ts` |
| Forged tokens | Tokens are verified with a 32+ character secret, HS256 only. | `middleware/auth.ts`, `tests/` |
| Role abuse | Sign-up only accepts SEEKER or EMPLOYER (tested). Each area (`/api/me`, `/api/employer`, `/api/admin`) checks the role, which is reloaded from the database on every request. | `app.ts`, `middleware/auth.ts` |
| Employer reading another company's data (IDOR) | Every employer route goes through one `ownJob()` check: job belongs to the caller's company, else **404** (tested for jobs, applicants, stage changes and resumes). | `employer.routes.ts` |
| Resume leaks | Resumes are stored in the database, not a public bucket. They are served only to their owner, or to the employer of a job the person applied to, with `Content-Security-Policy: sandbox`, `no-store` and `nosniff` so a PDF can't run script. Uploads must start with the `%PDF-` signature and are capped at 5 MB. | `seeker.routes.ts` |
| Private notes reaching candidates | The employer note is only selected on employer routes; the seeker's view never includes it (tested). | `seeker.routes.ts` |
| Abusive accounts | Suspension is checked on every request, so it takes effect immediately even for a live session (tested). Admins can't suspend themselves or other admins. | `middleware/auth.ts`, `admin.routes.ts` |
| Hidden or draft jobs leaking | Public search and job pages only show OPEN jobs that are not hidden and whose owner is not suspended. Drafts are visible only to their owner and admins (tested). | `lib/jobs.ts` |
| Duplicate applications | A unique constraint on (job, seeker) is the source of truth; the API returns 409 (tested). | `db/schema.ts` |
| SQL injection | All queries go through Drizzle's parameterized builder. Full-text input goes through `websearch_to_tsquery` as a bound parameter, and LIKE wildcards are escaped in admin search. | `lib/jobs.ts`, `admin.routes.ts` |
| Bad input | Every body, query and URL parameter is validated by **Zod** before a handler runs. JSON bodies are capped at 100 kB. | `middleware/validate.ts` |
| External links | Company websites must be `https://`, and are opened with `rel="noopener noreferrer"`. | `shared/src/index.ts` |
| Information leaks | Errors return a fixed shape with no stack traces. `x-powered-by` is disabled and **Helmet** sets security headers. | `errorHandler.ts`, `app.ts` |
| Secrets in git | Secrets come only from environment variables. `.env` is git-ignored and `.env.example` documents each one. | `lib/env.ts` |

The app also validates its own environment on startup (`lib/env.ts`): it refuses to boot with a missing database URL or a short JWT secret.

## Reporting

Found something? Open an issue or email the maintainer.
