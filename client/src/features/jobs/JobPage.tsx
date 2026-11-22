import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../lib/api';
import { ago, CompanyMark, Meta, SaveButton, Tag, Verified } from '../../components/bits';
import { useApply, useJob, useMe, useProfile, useToggleSave } from '../../lib/queries';

function Description({ text }: { text: string }) {
  return (
    <div className="flex max-w-prose flex-col gap-4 leading-relaxed">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split('\n');
        const heading = lines[0].endsWith(':') ? lines[0] : null;
        const rest = heading ? lines.slice(1) : lines;
        const isList = rest.length > 0 && rest.every((l) => l.trim().startsWith('- '));
        return (
          <div key={i}>
            {heading && <h3 className="font-semibold">{heading.slice(0, -1)}</h3>}
            {isList ? (
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-muted">{rest.map((l) => <li key={l}>{l.trim().slice(2)}</li>)}</ul>
            ) : (
              <p className="text-ink-muted">{rest.join(' ')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function JobPage() {
  const id = Number(useParams().id);
  const { data: job, isLoading, error } = useJob(id);
  const { data: me } = useMe();
  const toggle = useToggleSave();
  const toast = useToast();

  if (isLoading) return <div className="h-96 animate-pulse rounded-panel bg-sunken" />;
  if (error || !job) {
    return (
      <div className="py-20 text-center">
        <p className="text-xl font-semibold">This job isn’t available anymore.</p>
        <Link to="/" className="mt-3 inline-block font-medium underline">See open jobs</Link>
      </div>
    );
  }

  return (
    <>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft size={16} aria-hidden="true" />All jobs</Link>
      {(job.status !== 'OPEN' || job.hidden) && (
        <p className="mt-4 rounded-control bg-warn-soft px-4 py-2.5 text-sm text-warn">
          {job.hidden ? 'A moderator has hidden this job. Only you and admins can see it.' : job.status === 'DRAFT' ? 'This is a draft. Only you can see it.' : 'This job is closed to new applicants.'}
        </p>
      )}

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <article>
          <div className="flex items-start gap-4">
            <CompanyMark company={job.company} size={56} />
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">{job.title}</h1>
              <p className="mt-1 flex items-center gap-1.5">
                <Link to={`/companies/${job.company.slug}`} className="font-medium hover:underline">{job.company.name}</Link>
                <Verified company={job.company} />
                <span className="text-sm text-ink-muted">· {ago(job.publishedAt)}</span>
              </p>
            </div>
            {me?.role === 'SEEKER' && <SaveButton saved={Boolean(job.saved)} busy={toggle.isPending} onToggle={() => toggle.mutate({ jobId: job.id, save: !job.saved }, { onSuccess: () => toast(job.saved ? 'Removed from saved.' : 'Saved.') })} />}
          </div>
          <div className="mt-4"><Meta job={job} /></div>
          <div className="mt-4 flex flex-wrap gap-1.5">{job.tags.map((t) => <Tag key={t} to={`/?tag=${encodeURIComponent(t)}`}>{t}</Tag>)}</div>
          <hr className="my-8 border-rule" />
          <Description text={job.description} />
          <section className="mt-10 rounded-panel bg-sunken p-5">
            <h2 className="font-semibold">About {job.company.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{job.companyAbout}</p>
          </section>
        </article>

        <aside className="lg:sticky lg:top-24 lg:h-fit"><ApplyPanel jobId={job.id} applied={Boolean(job.applied)} open={job.status === 'OPEN' && !job.hidden} /></aside>
      </div>
    </>
  );
}

function ApplyPanel({ jobId, applied, open }: { jobId: number; applied: boolean; open: boolean }) {
  const { data: me } = useMe();
  const isSeeker = me?.role === 'SEEKER';
  const { data: profile } = useProfile(isSeeker);
  const apply = useApply();
  const toast = useToast();
  const navigate = useNavigate();
  const [note, setNote] = useState('');

  const box = 'rounded-panel border border-rule bg-surface p-5';
  if (!open) return null;
  if (applied) {
    return (
      <div className={box}>
        <p className="flex items-center gap-2 font-semibold text-ok"><CheckCircle2 size={20} aria-hidden="true" />You applied</p>
        <p className="mt-1 text-sm text-ink-muted">You’ll get a notification when the employer moves your application.</p>
        <Link to="/me/applications" className="mt-4 inline-block text-sm font-medium underline">Track your applications</Link>
      </div>
    );
  }
  if (!me) {
    return (
      <div className={box}>
        <p className="font-semibold">Interested?</p>
        <p className="mt-1 text-sm text-ink-muted">Create a free profile and apply with your resume in a minute.</p>
        <Button variant="primary" className="mt-4 h-11 w-full" onClick={() => navigate('/register?role=SEEKER', { state: { from: `/jobs/${jobId}` } })}>Sign up to apply</Button>
        <Link to="/login" state={{ from: `/jobs/${jobId}` }} className="mt-3 block text-center text-sm underline">I have an account</Link>
      </div>
    );
  }
  if (!isSeeker) return <div className={box}><p className="text-sm text-ink-muted">You’re signed in as {me.role === 'EMPLOYER' ? 'an employer' : 'an admin'}. Job seekers apply from here.</p></div>;

  const missing = !profile?.data ? 'profile' : !profile.resume ? 'resume' : null;
  if (missing) {
    return (
      <div className={box}>
        <p className="font-semibold">One step before applying</p>
        <p className="mt-1 text-sm text-ink-muted">{missing === 'profile' ? 'Add a headline and your skills so the employer knows who you are.' : 'Upload your resume as a PDF. It’s only shared with employers you apply to.'}</p>
        <Button variant="primary" className="mt-4 w-full" onClick={() => navigate('/me/profile', { state: { from: `/jobs/${jobId}` } })}>{missing === 'profile' ? 'Complete your profile' : 'Upload resume'}</Button>
      </div>
    );
  }

  return (
    <form
      className={box}
      onSubmit={(e) => {
        e.preventDefault();
        apply.mutate({ jobId, coverNote: note }, {
          onSuccess: () => toast('Application sent.'),
          onError: (err) => toast(err instanceof ApiError ? err.message : 'Applying failed.', { tone: 'error' }),
        });
      }}
    >
      <p className="font-semibold">Apply</p>
      <p className="mt-3 flex items-center gap-2 rounded-control bg-sunken px-3 py-2 text-sm"><FileText size={16} className="shrink-0 text-ink-muted" aria-hidden="true" /><span className="truncate">{profile!.resume!.name}</span></p>
      <label htmlFor="note" className="mt-4 block text-sm font-medium">Short note (optional)</label>
      <textarea id="note" rows={5} maxLength={3000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this role, in a few lines." className="mt-1.5 w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10" />
      <Button type="submit" variant="primary" loading={apply.isPending} className="mt-4 h-11 w-full">Send application</Button>
      <p className="mt-2 text-center text-xs text-ink-muted">Your profile and resume go to this employer only.</p>
    </form>
  );
}
