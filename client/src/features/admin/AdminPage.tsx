import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Company, Job, Role } from '@shortlist/shared';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { ago, CompanyMark, PageTitle, Verified } from '../../components/bits';
import { useAdminFlag, useAdminList, useAdminStats } from '../../lib/queries';

type Tab = 'companies' | 'jobs' | 'users';
interface AdminUser { id: number; name: string; email: string; role: Role; suspended: boolean; createdAt: string }

export function AdminPage() {
  const { data: s } = useAdminStats();
  const [tab, setTab] = useState<Tab>('companies');
  const [q, setQ] = useState('');
  return (
    <>
      <PageTitle sub="Keep the board trustworthy: verify real companies, pull bad posts, stop abusive accounts.">Moderation</PageTitle>
      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Job seekers', s?.users.SEEKER],
          ['Employers', s?.users.EMPLOYER],
          ['Open jobs', s?.openJobs],
          ['Applications, 7 days', s?.applicationsThisWeek],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-panel border border-rule bg-surface p-4">
            <dt className="text-sm text-ink-muted">{l}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{v?.toLocaleString() ?? '–'}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-rule pb-3" role="tablist">
        {(['companies', 'jobs', 'users'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => { setTab(t); setQ(''); }} className={`rounded-control px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-navy text-paper' : 'text-ink-muted hover:bg-sunken'}`}>
            {t}{t === 'companies' && s?.unverifiedCompanies ? <span className="ml-1.5 rounded-full bg-brand px-1.5 text-[11px] text-brand-ink">{s.unverifiedCompanies}</span> : null}
          </button>
        ))}
        {tab !== 'companies' && (
          <input type="search" aria-label={`Search ${tab}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab}`} className="ml-auto h-9 w-full rounded-control border border-rule-strong bg-surface px-3 text-sm focus:border-ink focus:outline-none sm:w-64" />
        )}
      </div>
      <div className="mt-4">{tab === 'companies' ? <Companies /> : tab === 'jobs' ? <Jobs q={q} /> : <Users q={q} />}</div>
    </>
  );
}

function Companies() {
  const { data } = useAdminList<Company & { owner: string; jobCount: number; createdAt: string }>('companies');
  const flag = useAdminFlag();
  const toast = useToast();
  return (
    <ul className="divide-y divide-rule rounded-panel border border-rule bg-surface">
      {data?.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-4 p-4">
          <CompanyMark company={c} size={40} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-medium"><Link to={`/companies/${c.slug}`} className="hover:underline">{c.name}</Link><Verified company={c} /></p>
            <p className="text-sm text-ink-muted">{c.owner} · {c.jobCount} jobs · joined {ago(c.createdAt).toLowerCase()}{c.website && <> · <a href={c.website} target="_blank" rel="noreferrer noopener" className="underline">website</a></>}</p>
          </div>
          <Button size="sm" variant={c.verified ? 'ghost' : 'primary'} onClick={() => flag.mutate({ path: `companies/${c.id}/verified`, value: !c.verified }, { onSuccess: () => toast(c.verified ? `${c.name} unverified.` : `${c.name} verified.`) })}>
            {c.verified ? 'Remove verification' : 'Verify'}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Jobs({ q }: { q: string }) {
  const { data } = useAdminList<Job>('jobs', q);
  const flag = useAdminFlag();
  const toast = useToast();
  return (
    <ul className="divide-y divide-rule rounded-panel border border-rule bg-surface">
      {data?.map((j) => (
        <li key={j.id} className="flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <Link to={`/jobs/${j.id}`} className="font-medium hover:underline">{j.title}</Link>
            <p className="text-sm text-ink-muted">{j.company.name} · {j.status.toLowerCase()} · {ago(j.publishedAt).toLowerCase()}</p>
          </div>
          {j.hidden && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">Hidden</span>}
          <Button size="sm" variant="ghost" className={j.hidden ? '' : '!text-danger'} onClick={() => flag.mutate({ path: `jobs/${j.id}/hidden`, value: !j.hidden }, { onSuccess: () => toast(j.hidden ? 'Job visible again.' : 'Job hidden. The employer was notified.') })}>
            {j.hidden ? 'Unhide' : 'Hide'}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Users({ q }: { q: string }) {
  const { data } = useAdminList<AdminUser>('users', q);
  const flag = useAdminFlag();
  const toast = useToast();
  return (
    <ul className="divide-y divide-rule rounded-panel border border-rule bg-surface">
      {data?.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{u.name}</p>
            <p className="text-sm text-ink-muted">{u.email} · {u.role.toLowerCase()} · joined {ago(u.createdAt).toLowerCase()}</p>
          </div>
          {u.suspended && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">Suspended</span>}
          {u.role !== 'ADMIN' && (
            <Button size="sm" variant="ghost" className={u.suspended ? '' : '!text-danger'} onClick={() => flag.mutate({ path: `users/${u.id}/suspended`, value: !u.suspended }, { onSuccess: () => toast(u.suspended ? `${u.name} reinstated.` : `${u.name} suspended and signed out.`), onError: (e) => toast(e.message, { tone: 'error' }) })}>
              {u.suspended ? 'Reinstate' : 'Suspend'}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
