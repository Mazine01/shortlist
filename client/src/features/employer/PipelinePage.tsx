import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FileText, Mail } from 'lucide-react';
import { APP_STATUSES, APP_STATUS_LABELS, type Applicant, type AppStatus } from '@shortlist/shared';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Dialogs';
import { useToast } from '../../components/ui/Toast';
import { apiUrl } from '../../lib/api';
import { ago, Empty } from '../../components/bits';
import { useApplicants, useEmployerJob, useUpdateApplicant } from '../../lib/queries';

const FLOW: AppStatus[] = ['APPLIED', 'REVIEWING', 'INTERVIEW', 'OFFER'];
const COLUMN_TONE: Record<AppStatus, string> = { APPLIED: 'bg-rule-strong', REVIEWING: 'bg-lavender', INTERVIEW: 'bg-warn', OFFER: 'bg-ok', REJECTED: 'bg-rule' };

export function PipelinePage() {
  const jobId = Number(useParams().id);
  const { data: job } = useEmployerJob(jobId);
  const { data: applicants, isLoading } = useApplicants(jobId);
  const move = useUpdateApplicant(jobId);
  const toast = useToast();
  const [openId, setOpenId] = useState<number | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const selected = applicants?.find((a) => a.id === openId) ?? null;

  const moveTo = (a: Applicant, status: AppStatus) =>
    move.mutate({ id: a.id, status }, {
      onSuccess: () => toast(`${a.seeker.name} moved to ${APP_STATUS_LABELS[status]}. They’ve been notified.`),
      onError: (e) => toast(e.message, { tone: 'error' }),
    });

  const rejected = applicants?.filter((a) => a.status === 'REJECTED') ?? [];

  return (
    <>
      <Link to="/employer" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft size={16} aria-hidden="true" />All jobs</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[32px] sm:leading-[38px]">{job?.title ?? 'Applicants'}</h1>
          <p className="mt-1 text-ink-muted">{applicants?.length ?? 0} applicants · tags {job?.tags.join(', ')}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/jobs/${jobId}`} className="h-9 rounded-control border border-rule-strong px-3 text-sm font-medium leading-9 hover:bg-sunken">View post</Link>
          <Link to={`/employer/jobs/${jobId}/edit`} className="h-9 rounded-control border border-rule-strong px-3 text-sm font-medium leading-9 hover:bg-sunken">Edit job</Link>
        </div>
      </div>

      {isLoading ? <div className="mt-8 h-96 animate-pulse rounded-panel bg-sunken" /> : !applicants?.length ? (
        <div className="mt-8"><Empty title="No applicants yet." body="When people apply, they land in the first column and you’ll get a notification." /></div>
      ) : (
        <>
          <div className="-mx-4 mt-8 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            <div className="grid min-w-[880px] grid-cols-4 gap-4">
              {FLOW.map((stage, i) => {
                const cards = applicants.filter((a) => a.status === stage);
                return (
                  <section key={stage} aria-labelledby={`col-${stage}`} className="flex flex-col rounded-panel bg-sunken/70 p-2.5">
                    <h2 id={`col-${stage}`} className="flex items-center gap-2 px-1.5 pb-2.5 pt-1 text-sm font-semibold">
                      <span className={`h-2.5 w-2.5 rounded-full ${COLUMN_TONE[stage]}`} aria-hidden="true" />
                      {APP_STATUS_LABELS[stage]}
                      <span className="tabular ml-auto text-ink-muted">{cards.length}</span>
                    </h2>
                    <ul className="flex min-h-24 flex-col gap-2">
                      {cards.map((a) => (
                        <li key={a.id} className="rounded-control border border-rule bg-surface p-3 shadow-[0_1px_2px_rgb(16_26_51/0.05)]">
                          <button type="button" onClick={() => setOpenId(a.id)} className="w-full text-left">
                            <p className="font-medium leading-snug hover:underline">{a.seeker.name}</p>
                            <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">{a.seeker.headline ?? 'No headline'}{a.seeker.location && ` · ${a.seeker.location}`}</p>
                          </button>
                          {a.matchingSkills.length > 0 && (
                            <p className="mt-2 flex flex-wrap gap-1">{a.matchingSkills.slice(0, 3).map((s) => <span key={s} className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok">{s}</span>)}</p>
                          )}
                          <div className="mt-2.5 flex items-center justify-between gap-1">
                            <span className="text-[11px] text-ink-muted">{ago(a.createdAt)}</span>
                            <span className="flex gap-1">
                              {i > 0 && <IconBtn label={`Move ${a.seeker.name} back to ${APP_STATUS_LABELS[FLOW[i - 1]]}`} onClick={() => moveTo(a, FLOW[i - 1])}><ArrowLeft size={14} /></IconBtn>}
                              {i < FLOW.length - 1 && (
                                <button type="button" onClick={() => moveTo(a, FLOW[i + 1])} className="inline-flex h-7 items-center gap-1 rounded-md bg-navy px-2 text-xs font-semibold text-paper hover:bg-navy/85">
                                  {APP_STATUS_LABELS[FLOW[i + 1]]}<ArrowRight size={13} aria-hidden="true" />
                                </button>
                              )}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
          {rejected.length > 0 && (
            <div className="mt-4">
              <button type="button" onClick={() => setShowRejected(!showRejected)} className="text-sm text-ink-muted underline">{showRejected ? 'Hide' : 'Show'} {rejected.length} not moving forward</button>
              {showRejected && (
                <ul className="mt-3 flex flex-wrap gap-2">{rejected.map((a) => <li key={a.id}><button type="button" onClick={() => setOpenId(a.id)} className="rounded-full border border-rule bg-surface px-3 py-1.5 text-sm hover:border-rule-strong">{a.seeker.name}</button></li>)}</ul>
              )}
            </div>
          )}
        </>
      )}

      {selected && <ApplicantDrawer key={selected.id} applicant={selected} jobId={jobId} onClose={() => setOpenId(null)} onMove={(s) => moveTo(selected, s)} />}
    </>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-sunken hover:text-ink">{children}</button>;
}

function ApplicantDrawer({ applicant: a, jobId, onClose, onMove }: { applicant: Applicant; jobId: number; onClose: () => void; onMove: (s: AppStatus) => void }) {
  const update = useUpdateApplicant(jobId);
  const toast = useToast();
  const [note, setNote] = useState(a.employerNote ?? '');
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={a.seeker.name} description={a.seeker.headline ?? undefined}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          {a.hasResume && <a href={apiUrl(`/api/employer/applications/${a.id}/resume`)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-control bg-navy px-3 text-sm font-medium text-paper"><FileText size={16} aria-hidden="true" />Open resume</a>}
          <a href={`mailto:${a.seeker.email}`} className="inline-flex h-9 items-center gap-2 rounded-control border border-rule-strong px-3 text-sm font-medium hover:bg-sunken"><Mail size={16} aria-hidden="true" />{a.seeker.email}</a>
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
          <dt className="text-ink-muted">Stage</dt><dd className="font-medium">{APP_STATUS_LABELS[a.status]}</dd>
          <dt className="text-ink-muted">Applied</dt><dd>{ago(a.createdAt)}</dd>
          <dt className="text-ink-muted">Location</dt><dd>{a.seeker.location ?? '–'}</dd>
          <dt className="text-ink-muted">Skills</dt>
          <dd className="flex flex-wrap gap-1">{a.seeker.skills.map((s) => <span key={s} className={`rounded-full px-2 py-0.5 text-xs ${a.matchingSkills.includes(s) ? 'bg-ok-soft font-medium text-ok' : 'bg-sunken text-ink-muted'}`}>{s}</span>)}</dd>
        </dl>
        {a.coverNote && <section><h3 className="text-sm font-semibold">Their note</h3><p className="mt-1.5 whitespace-pre-line rounded-control bg-sunken p-3 text-sm leading-relaxed">{a.coverNote}</p></section>}
        <section>
          <label htmlFor="enote" className="text-sm font-semibold">Private note</label>
          <p className="text-xs text-ink-muted">Only your team sees this. The candidate never does.</p>
          <textarea id="enote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none" />
          <Button size="sm" className="mt-2" loading={update.isPending && update.variables?.employerNote !== undefined} onClick={() => update.mutate({ id: a.id, employerNote: note }, { onSuccess: () => toast('Note saved.') })}>Save note</Button>
        </section>
        <section className="border-t border-rule pt-5">
          <h3 className="text-sm font-semibold">Move to</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {APP_STATUSES.filter((s) => s !== a.status).map((s) => (
              <Button key={s} size="sm" variant={s === 'REJECTED' ? 'ghost' : 'secondary'} className={s === 'REJECTED' ? '!text-danger' : ''} onClick={() => onMove(s)}>{APP_STATUS_LABELS[s]}</Button>
            ))}
          </div>
        </section>
      </div>
    </Drawer>
  );
}
