import { Link } from 'react-router-dom';
import { BadgeCheck, Bookmark, BookmarkCheck } from 'lucide-react';
import { APP_STATUS_LABELS, JOB_TYPE_LABELS, REGION_LABELS, REMOTE_LABELS, type AppStatus, type CompanyBrief, type JobCard } from '@shortlist/shared';

export function CompanyMark({ company, size = 44 }: { company: Pick<CompanyBrief, 'initials' | 'hue' | 'name'>; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-[10px] font-semibold tracking-tight"
      style={{ width: size, height: size, fontSize: size * 0.36, backgroundColor: `hsl(${company.hue} 55% 92%)`, color: `hsl(${company.hue} 45% 30%)` }}
    >
      {company.initials}
    </span>
  );
}

export function Verified({ company }: { company: Pick<CompanyBrief, 'verified'> }) {
  if (!company.verified) return null;
  return <BadgeCheck size={15} className="inline shrink-0 text-ok" aria-label="Verified company" />;
}

export const salary = (j: Pick<JobCard, 'salaryMin' | 'salaryMax' | 'currency'>) => {
  if (!j.salaryMin && !j.salaryMax) return null;
  const f = (n: number) => `${Math.round(n / 1000)}k`;
  const sym = j.currency === 'EUR' ? '€' : j.currency === 'GBP' ? '£' : '$';
  if (j.salaryMin && j.salaryMax) return `${sym}${f(j.salaryMin)} – ${sym}${f(j.salaryMax)}`;
  return `${sym}${f((j.salaryMin ?? j.salaryMax)!)}${j.salaryMin ? '+' : ''}`;
};

export function ago(iso: string | null) {
  if (!iso) return 'Not published';
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return 'Just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function Meta({ job }: { job: JobCard }) {
  const parts = [REMOTE_LABELS[job.remoteType], job.remoteType === 'REMOTE' ? REGION_LABELS[job.region] : job.location, JOB_TYPE_LABELS[job.jobType]].filter(Boolean);
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-muted">
      {parts.map((p) => <span key={p}>{p}</span>)}
      {salary(job) && <span className="font-medium text-ink">{salary(job)}</span>}
    </p>
  );
}

export function Tag({ children, to }: { children: string; to?: string }) {
  const cls = 'inline-flex rounded-full bg-sunken px-2.5 py-1 text-xs font-medium text-ink-muted';
  return to ? <Link to={to} className={`${cls} hover:bg-rule hover:text-ink`}>{children}</Link> : <span className={cls}>{children}</span>;
}

export function SaveButton({ saved, onToggle, busy }: { saved: boolean; onToggle: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save job'}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-control transition-colors ${saved ? 'bg-lavender-soft text-[rgb(84_76_200)] dark:text-lavender' : 'text-ink-muted hover:bg-sunken hover:text-ink'}`}
    >
      {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
    </button>
  );
}

const STATUS_TONES: Record<AppStatus, string> = {
  APPLIED: 'bg-sunken text-ink-muted',
  REVIEWING: 'bg-lavender-soft text-[rgb(84_76_200)] dark:text-lavender',
  INTERVIEW: 'bg-warn-soft text-warn',
  OFFER: 'bg-ok-soft text-ok',
  REJECTED: 'bg-sunken text-ink-muted line-through decoration-1',
};

export function AppStatusChip({ status }: { status: AppStatus }) {
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONES[status]}`}>{APP_STATUS_LABELS[status]}</span>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-panel border border-dashed border-rule-strong bg-surface px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[32px] sm:leading-[38px]">{children}</h1>
      {sub && <p className="mt-1 text-ink-muted">{sub}</p>}
    </div>
  );
}
