import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { JOB_TYPES, JOB_TYPE_LABELS, REGIONS, REGION_LABELS, REMOTE_LABELS, REMOTE_TYPES, type JobCard, type JobSearch } from '@shortlist/shared';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { ago, CompanyMark, Empty, Meta, SaveButton, Tag, Verified } from '../../components/bits';
import { useJobs, useMe, useTags, useToggleSave } from '../../lib/queries';

const SALARIES = [0, 40000, 60000, 80000, 100000];

export function JobsPage() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? undefined;
  const query: JobSearch = {
    q: get('q'),
    remote: get('remote') as JobSearch['remote'],
    type: get('type') as JobSearch['type'],
    region: get('region') as JobSearch['region'],
    salary: Number(get('salary')) || undefined,
    tag: get('tag'),
    since: Number(get('since')) || undefined,
    page: Number(get('page')) || 1,
    limit: 20,
  };
  const jobs = useJobs(query);
  const { data: tags } = useTags();
  const [text, setText] = useState(query.q ?? '');
  useEffect(() => setText(query.q ?? ''), [query.q]);

  const set = (patch: Record<string, string | number | undefined>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) (v ? next.set(k, String(v)) : next.delete(k));
      if (!('page' in patch)) next.delete('page');
      return next;
    });
  const active = ['q', 'remote', 'type', 'region', 'salary', 'tag', 'since'].some((k) => params.get(k));
  const meta = jobs.data?.meta;

  return (
    <>
      <section className="rounded-panel bg-[rgb(16_26_51)] px-5 py-8 text-white sm:px-10 sm:py-12 dark:bg-surface dark:ring-1 dark:ring-rule">
        <h1 className="max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[44px]">Remote work for people who’d rather write than meet.</h1>
        <p className="mt-3 max-w-xl text-white/70 dark:text-ink-muted">Async-friendly jobs in security, engineering and data. Every post shows the pay range when the company shares it.</p>
        <form role="search" className="mt-7 flex max-w-2xl gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() || undefined }); }}>
          <div className="relative flex-1">
            <label htmlFor="q" className="sr-only">Search jobs</label>
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input id="q" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Try “SOC analyst splunk” or “react typescript”" className="h-12 w-full rounded-control border-0 bg-white pl-10 pr-3 text-base text-[rgb(16_26_51)] placeholder:text-[rgb(120_130_155)] focus:outline-none focus:ring-2 focus:ring-brand dark:bg-sunken dark:text-ink" />
          </div>
          <Button type="submit" variant="primary" className="h-12 px-6 text-base">Search</Button>
        </form>
        {tags && (
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Popular skills">
            {tags.slice(0, 10).map((t) => (
              <button key={t.tag} type="button" onClick={() => set({ tag: query.tag === t.tag ? undefined : t.tag })} aria-pressed={query.tag === t.tag} className={`rounded-full px-3 py-1 text-sm ${query.tag === t.tag ? 'bg-brand text-brand-ink' : 'bg-white/10 text-white/85 hover:bg-white/20 dark:bg-sunken dark:text-ink-muted'}`}>
                {t.tag}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside aria-label="Filters" className="flex flex-col gap-6 lg:sticky lg:top-24 lg:h-fit">
          <Filter label="Work setup" value={query.remote} options={REMOTE_TYPES.map((v) => [v, REMOTE_LABELS[v]])} onChange={(v) => set({ remote: v })} />
          <Filter label="Hiring from" value={query.region} options={REGIONS.map((v) => [v, REGION_LABELS[v]])} onChange={(v) => set({ region: v })} />
          <Filter label="Job type" value={query.type} options={JOB_TYPES.map((v) => [v, JOB_TYPE_LABELS[v]])} onChange={(v) => set({ type: v })} />
          <Filter label="Pays at least" value={query.salary ? String(query.salary) : undefined} options={SALARIES.slice(1).map((s) => [String(s), `$${s / 1000}k a year`])} onChange={(v) => set({ salary: v })} />
          <Filter label="Posted" value={query.since ? String(query.since) : undefined} options={[['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days']]} onChange={(v) => set({ since: v })} />
          {active && <Button variant="ghost" className="-ml-2 self-start" onClick={() => { setText(''); setParams({}); }}><X size={16} aria-hidden="true" />Clear all</Button>}
        </aside>

        <section aria-label="Results" aria-busy={jobs.isFetching}>
          {meta && (
            <p className="tabular mb-4 text-sm text-ink-muted">
              <span className="font-semibold text-ink">{meta.total.toLocaleString()}</span> {meta.total === 1 ? 'job' : 'jobs'}
              {query.tag && <> tagged <span className="font-semibold text-ink">{query.tag}</span></>}
              {query.q ? <>, best matches first</> : <>, newest first</>}
              {meta.tookMs !== undefined && <span className="ml-2 text-xs">({meta.tookMs} ms)</span>}
            </p>
          )}
          {jobs.isLoading ? (
            <div className="flex flex-col gap-3" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-panel bg-sunken" />)}</div>
          ) : jobs.data?.data.length ? (
            <ul className={`flex flex-col gap-3 ${jobs.isPlaceholderData ? 'opacity-60' : ''}`}>
              {jobs.data.data.map((j) => <JobRow key={j.id} job={j} />)}
            </ul>
          ) : (
            <Empty title="No jobs match all of that." body="Remove a filter or two, or try a broader word like “security” or “backend”." action={<Button onClick={() => { setText(''); setParams({}); }}>Clear filters</Button>} />
          )}
          {meta && meta.pages > 1 && (
            <nav aria-label="Pages" className="mt-8 flex items-center justify-between text-sm">
              <Button size="sm" disabled={meta.page <= 1} onClick={() => set({ page: meta.page - 1 })}>Previous</Button>
              <span className="tabular text-ink-muted">Page {meta.page} of {meta.pages}</span>
              <Button size="sm" disabled={meta.page >= meta.pages} onClick={() => set({ page: meta.page + 1 })}>Next</Button>
            </nav>
          )}
        </section>
      </div>
    </>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value?: string; options: string[][]; onChange: (v: string | undefined) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(value === v ? undefined : v)} className={`rounded-control px-2.5 py-1.5 text-left text-sm transition-colors ${value === v ? 'bg-navy font-medium text-paper' : 'bg-sunken text-ink-muted hover:text-ink lg:bg-transparent lg:hover:bg-sunken'}`}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function JobRow({ job }: { job: JobCard }) {
  const { data: me } = useMe();
  const toggle = useToggleSave();
  const toast = useToast();
  return (
    <li className="group relative rounded-panel border border-rule bg-surface p-4 transition-colors hover:border-rule-strong sm:p-5">
      <div className="flex gap-4">
        <CompanyMark company={job.company} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold leading-snug">
                <Link to={`/jobs/${job.id}`} className="after:absolute after:inset-0 after:rounded-panel group-hover:underline">{job.title}</Link>
              </h3>
              <p className="mt-0.5 flex items-center gap-1 text-sm">{job.company.name} <Verified company={job.company} /></p>
            </div>
            <div className="relative z-10 flex items-center gap-2">
              {job.applied && <span className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">Applied</span>}
              {me?.role === 'SEEKER' && (
                <SaveButton saved={Boolean(job.saved)} busy={toggle.isPending} onToggle={() => toggle.mutate({ jobId: job.id, save: !job.saved }, { onSuccess: () => toast(job.saved ? 'Removed from saved.' : 'Saved. Find it under Saved.') })} />
              )}
            </div>
          </div>
          <div className="mt-2"><Meta job={job} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {job.tags.slice(0, 5).map((t) => <Tag key={t}>{t}</Tag>)}
            <span className="ml-auto text-xs text-ink-muted">{ago(job.publishedAt)}</span>
          </div>
        </div>
      </div>
    </li>
  );
}
