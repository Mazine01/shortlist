import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, Upload, X } from 'lucide-react';
import { APP_STATUSES, APP_STATUS_LABELS, MAX_RESUME_BYTES, profileSchema, REGIONS, REGION_LABELS, type ProfileInput } from '@shortlist/shared';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialogs';
import { SelectField, TextField } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { ApiError, apiUrl } from '../../lib/api';
import { ago, AppStatusChip, CompanyMark, Empty, PageTitle } from '../../components/bits';
import { useMyApplications, useProfile, useSaved, useSaveProfile, useUploadResume, useWithdraw } from '../../lib/queries';
import { JobRow } from '../jobs/JobsPage';

const FLOW = APP_STATUSES.filter((s) => s !== 'REJECTED');

export function ApplicationsPage() {
  const { data, isLoading } = useMyApplications();
  const withdraw = useWithdraw();
  const toast = useToast();
  const [confirm, setConfirm] = useState<number | null>(null);

  return (
    <>
      <PageTitle sub="Where each application stands. You’ll be notified when an employer moves one.">Applications</PageTitle>
      <div className="mt-8">
        {isLoading ? <div className="h-64 animate-pulse rounded-panel bg-sunken" /> : !data?.length ? (
          <Empty title="You haven’t applied anywhere yet." body="Find a role you like and apply with your profile and resume." action={<Link to="/" className="font-medium underline">Browse jobs</Link>} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.map((a) => {
              const step = FLOW.indexOf(a.status as (typeof FLOW)[number]);
              return (
                <li key={a.id} className="rounded-panel border border-rule bg-surface p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    <CompanyMark company={a.job.company} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link to={`/jobs/${a.job.id}`} className="font-semibold hover:underline">{a.job.title}</Link>
                          <p className="text-sm text-ink-muted">{a.job.company.name} · applied {ago(a.createdAt).toLowerCase()}</p>
                        </div>
                        <AppStatusChip status={a.status} />
                      </div>
                      {a.status !== 'REJECTED' ? (
                        <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Progress">
                          {FLOW.map((s, i) => (
                            <li key={s} aria-current={i === step ? 'step' : undefined}>
                              <div className={`h-1.5 rounded-full ${i <= step ? (s === 'OFFER' ? 'bg-ok' : 'bg-navy') : 'bg-sunken'}`} />
                              <p className={`mt-1.5 text-xs ${i === step ? 'font-semibold' : 'text-ink-muted'}`}>{APP_STATUS_LABELS[s]}</p>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-3 text-sm text-ink-muted">The team went with other candidates this time.</p>
                      )}
                      {a.status !== 'OFFER' && (
                        <button type="button" onClick={() => setConfirm(a.id)} className="mt-3 text-sm text-ink-muted underline hover:text-danger">Withdraw</button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Withdraw this application?"
        body="The employer won’t see it anymore. You can apply again later if the job is still open."
        confirmLabel="Withdraw"
        cancelLabel="Keep it"
        loading={withdraw.isPending}
        onConfirm={() => withdraw.mutate(confirm!, { onSuccess: () => { setConfirm(null); toast('Application withdrawn.'); }, onError: (e) => toast(e.message, { tone: 'error' }) })}
      />
    </>
  );
}

export function SavedPage() {
  const { data, isLoading } = useSaved();
  return (
    <>
      <PageTitle sub="Jobs you bookmarked. Closed jobs drop off this list.">Saved</PageTitle>
      <div className="mt-8">
        {isLoading ? <div className="h-64 animate-pulse rounded-panel bg-sunken" /> : data?.length ? (
          <ul className="flex flex-col gap-3">{data.map((j) => <JobRow key={j.id} job={j} />)}</ul>
        ) : (
          <Empty title="Nothing saved yet." body="Tap the bookmark on any job to keep it here for later." action={<Link to="/" className="font-medium underline">Browse jobs</Link>} />
        )}
      </div>
    </>
  );
}

export function ProfilePage() {
  const { data, isLoading } = useProfile();
  const save = useSaveProfile();
  const upload = useUploadResume();
  const toast = useToast();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const fileRef = useRef<HTMLInputElement>(null);
  const [skill, setSkill] = useState('');

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { headline: '', location: '', region: 'WORLDWIDE', skills: [], about: '' },
  });
  useEffect(() => {
    if (data?.data) reset({ ...data.data, about: data.data.about ?? '' });
  }, [data, reset]);
  const skills = watch('skills');

  const addSkill = () => {
    const s = skill.trim().toLowerCase();
    if (s && !skills.includes(s) && skills.length < 20) setValue('skills', [...skills, s], { shouldDirty: true });
    setSkill('');
  };

  if (isLoading) return <div className="h-96 animate-pulse rounded-panel bg-sunken" />;

  return (
    <div className="max-w-2xl">
      <PageTitle sub="Employers see this, plus your resume, only when you apply to them.">Your profile</PageTitle>

      <section aria-labelledby="resume-h" className="mt-8 rounded-panel border border-rule bg-surface p-5">
        <h2 id="resume-h" className="font-semibold">Resume</h2>
        {data?.resume ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <FileText className="text-ink-muted" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <a href={apiUrl('/api/me/resume')} target="_blank" rel="noreferrer" className="block truncate font-medium underline">{data.resume.name}</a>
              <p className="text-xs text-ink-muted">{(data.resume.size / 1024).toFixed(0)} KB · uploaded {ago(data.resume.uploadedAt).toLowerCase()}</p>
            </div>
            <Button size="sm" onClick={() => fileRef.current?.click()} loading={upload.isPending}>Replace</Button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 flex w-full flex-col items-center rounded-control border-2 border-dashed border-rule-strong px-4 py-8 text-center hover:border-ink-muted">
            <Upload className="text-ink-muted" aria-hidden="true" />
            <span className="mt-2 font-medium">{upload.isPending ? 'Uploading…' : 'Upload your resume'}</span>
            <span className="text-sm text-ink-muted">PDF, up to 5 MB</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          aria-label="Resume file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > MAX_RESUME_BYTES) return toast('That file is over 5 MB. Try a smaller export.', { tone: 'error' });
            upload.mutate(f, { onSuccess: () => toast('Resume uploaded.'), onError: (err) => toast(err.message, { tone: 'error' }) });
          }}
        />
        <p className="mt-3 text-xs text-ink-muted">Applications keep the resume you had when you applied, so replacing it won’t change those.</p>
      </section>

      <form
        noValidate
        className="mt-6 flex flex-col gap-5 rounded-panel border border-rule bg-surface p-5"
        onSubmit={handleSubmit((v) =>
          save.mutate(v, {
            onSuccess: () => {
              toast('Profile saved.');
              if (from && data?.resume) navigate(from);
            },
            onError: (e) => toast(e instanceof ApiError ? e.message : 'Saving failed.', { tone: 'error' }),
          }),
        )}
      >
        <TextField label="Headline" placeholder="e.g. Junior SOC analyst, Splunk and Suricata" error={errors.headline?.message} {...register('headline')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Where you live" placeholder="City, country" error={errors.location?.message} {...register('location')} />
          <SelectField label="Region you can work from" error={errors.region?.message} {...register('region')}>
            {REGIONS.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
          </SelectField>
        </div>
        <div>
          <label htmlFor="skill" className="text-sm font-medium">Skills</label>
          <p className="text-xs text-ink-muted">Employers see which of your skills match their job.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-sunken py-1 pl-3 pr-1 text-sm">
                {s}
                <button type="button" aria-label={`Remove ${s}`} onClick={() => setValue('skills', skills.filter((x) => x !== s), { shouldDirty: true })} className="grid h-5 w-5 place-items-center rounded-full hover:bg-rule"><X size={12} /></button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input id="skill" value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); } }} placeholder="Type a skill and press Enter" className="h-10 flex-1 rounded-control border border-rule-strong bg-surface px-3 text-base focus:border-ink focus:outline-none sm:text-sm" />
            <Button onClick={addSkill}>Add</Button>
          </div>
          {errors.skills && <p className="mt-1 text-sm text-danger">{errors.skills.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="about" className="text-sm font-medium">About you (optional)</label>
          <textarea id="about" rows={4} className="rounded-control border border-rule-strong bg-surface px-3 py-2 text-base focus:border-ink focus:outline-none sm:text-sm" {...register('about')} />
        </div>
        <Button type="submit" variant="primary" loading={save.isPending} className="self-start">Save profile</Button>
      </form>
    </div>
  );
}
