import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { APP_STATUSES, APP_STATUS_LABELS, companySchema, JOB_TYPES, JOB_TYPE_LABELS, REGIONS, REGION_LABELS, REMOTE_LABELS, REMOTE_TYPES, type CompanyInput, type EmployerJob, type JobInput } from '@shortlist/shared';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../lib/api';
import { ago, CompanyMark, Empty, PageTitle, Verified } from '../../components/bits';
import { useEmployerJob, useEmployerJobs, useMe, useMyCompany, useSaveCompany, useSaveJob } from '../../lib/queries';

const STAGE_COLORS: Record<string, string> = { APPLIED: 'bg-rule-strong', REVIEWING: 'bg-lavender', INTERVIEW: 'bg-warn', OFFER: 'bg-ok', REJECTED: 'bg-sunken' };

export function EmployerDashboard() {
  const { data: me } = useMe();
  const { data: company } = useMyCompany();
  const { data: jobs, isLoading } = useEmployerJobs();
  if (me && !me.hasCompany) return <Navigate to="/employer/company" replace />;

  const open = jobs?.filter((j) => j.status === 'OPEN') ?? [];
  const waiting = jobs?.reduce((a, j) => a + j.counts.APPLIED, 0) ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {company && <CompanyMark company={company} size={52} />}
          <PageTitle sub={<>{open.length} open {open.length === 1 ? 'role' : 'roles'} · <span className={waiting ? 'font-semibold text-brand' : ''}>{waiting} new {waiting === 1 ? 'applicant' : 'applicants'} to review</span></>}>
            <span className="flex items-center gap-2">{company?.name ?? 'Hiring'} {company && <Verified company={company} />}</span>
          </PageTitle>
        </div>
        <Link to="/employer/jobs/new" className="inline-flex h-10 items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-brand-ink hover:bg-brand/90"><Plus size={16} aria-hidden="true" />Post a job</Link>
      </div>
      {company && !company.verified && <p className="mt-5 rounded-control bg-warn-soft px-4 py-2.5 text-sm text-warn">Your company is waiting for verification. Jobs are live meanwhile; verified companies get a check mark.</p>}

      <div className="mt-8">
        {isLoading ? <div className="h-64 animate-pulse rounded-panel bg-sunken" /> : !jobs?.length ? (
          <Empty title="No jobs yet." body="Post your first role. Drafts stay private until you open them." action={<Link to="/employer/jobs/new" className="font-medium underline">Post a job</Link>} />
        ) : (
          <ul className="flex flex-col gap-3">{jobs.map((j) => <JobLine key={j.id} job={j} />)}</ul>
        )}
      </div>
    </>
  );
}

function JobLine({ job }: { job: EmployerJob }) {
  const total = job.applicationCount ?? 0;
  return (
    <li className="rounded-panel border border-rule bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/employer/jobs/${job.id}`} className="font-semibold hover:underline">{job.title}</Link>
          <p className="text-sm text-ink-muted">
            {job.hidden ? <span className="font-medium text-danger">Hidden by a moderator</span> : job.status === 'OPEN' ? `Open · posted ${ago(job.publishedAt).toLowerCase()}` : job.status === 'DRAFT' ? 'Draft, not visible yet' : 'Closed'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/employer/jobs/${job.id}/edit`} className="h-9 rounded-control border border-rule-strong px-3 text-sm font-medium leading-9 hover:bg-sunken">Edit</Link>
          <Link to={`/employer/jobs/${job.id}`} className="h-9 rounded-control bg-navy px-3 text-sm font-medium leading-9 text-paper hover:bg-navy/90">Applicants ({total})</Link>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            {APP_STATUSES.map((s) => job.counts[s] > 0 && <span key={s} className={STAGE_COLORS[s]} style={{ width: `${(job.counts[s] / total) * 100}%` }} />)}
          </div>
          <p className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            {APP_STATUSES.map((s) => <span key={s}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${STAGE_COLORS[s]}`} />{APP_STATUS_LABELS[s]} <span className="font-semibold text-ink">{job.counts[s]}</span></span>)}
          </p>
        </div>
      )}
    </li>
  );
}

export function CompanyForm() {
  const { data: company, isLoading } = useMyCompany();
  const save = useSaveCompany();
  const toast = useToast();
  const navigate = useNavigate();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<CompanyInput>({ resolver: zodResolver(companySchema), defaultValues: { name: '', website: '', about: '', size: '11-50' } });
  useEffect(() => {
    if (company) reset({ name: company.name, website: company.website ?? '', about: company.about, size: company.size as CompanyInput['size'] });
  }, [company, reset]);
  if (isLoading) return <div className="h-64 animate-pulse rounded-panel bg-sunken" />;

  return (
    <div className="max-w-2xl">
      <PageTitle sub={company ? 'What candidates see on every job you post.' : 'Tell candidates who you are. You can post jobs right after.'}>{company ? 'Company profile' : 'Set up your company'}</PageTitle>
      <form
        noValidate
        className="mt-8 flex flex-col gap-5 rounded-panel border border-rule bg-surface p-5"
        onSubmit={handleSubmit((v) => save.mutate(v, {
          onSuccess: () => { toast('Company saved.'); if (!company) navigate('/employer'); },
          onError: (e) => { if (e instanceof ApiError && e.fields) for (const [f, m] of Object.entries(e.fields)) setError(f as keyof CompanyInput, { message: m }); else toast(e.message, { tone: 'error' }); },
        }))}
      >
        <TextField label="Company name" error={errors.name?.message} hint={company?.verified ? 'Changing the name removes the verified badge until a moderator checks again.' : undefined} {...register('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Website (optional)" placeholder="https://" error={errors.website?.message} {...register('website')} />
          <SelectField label="Team size" {...register('size')}>{['1-10', '11-50', '51-200', '201-1000', '1000+'].map((s) => <option key={s}>{s}</option>)}</SelectField>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="about" className="text-sm font-medium">About the company</label>
          <textarea id="about" rows={5} placeholder="What you do, how the team works, where people are." className={`rounded-control border bg-surface px-3 py-2 text-base focus:border-ink focus:outline-none sm:text-sm ${errors.about ? 'border-danger' : 'border-rule-strong'}`} {...register('about')} />
          {errors.about && <p role="alert" className="text-sm text-danger">{errors.about.message}</p>}
        </div>
        <Button type="submit" variant="primary" loading={save.isPending} className="self-start">{company ? 'Save company' : 'Create company'}</Button>
      </form>
    </div>
  );
}

type JobForm = Omit<JobInput, 'salaryMin' | 'salaryMax'> & { salaryMin: string; salaryMax: string };

export function JobEditor() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const { data: job, isLoading } = useEmployerJob(id);
  const save = useSaveJob();
  const toast = useToast();
  const navigate = useNavigate();
  const [tag, setTag] = useState('');
  const { register, handleSubmit, reset, watch, setValue, setError, clearErrors, formState: { errors } } = useForm<JobForm>({
    defaultValues: { title: '', description: '', remoteType: 'REMOTE', jobType: 'FULL_TIME', region: 'WORLDWIDE', location: '', salaryMin: '', salaryMax: '', currency: 'USD', tags: [], status: 'OPEN' },
  });
  useEffect(() => {
    if (job)
      reset({
        title: job.title,
        description: job.description,
        remoteType: job.remoteType,
        jobType: job.jobType,
        region: job.region,
        location: job.location ?? '',
        salaryMin: job.salaryMin ? String(job.salaryMin) : '',
        salaryMax: job.salaryMax ? String(job.salaryMax) : '',
        currency: job.currency as JobForm['currency'],
        tags: job.tags,
        status: job.status,
      });
  }, [job, reset]);
  const tags = watch('tags') ?? [];
  const remote = watch('remoteType');
  const addTag = () => {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 8) {
      setValue('tags', [...tags, t]);
      clearErrors('tags');
    }
    setTag('');
  };

  if (id && isLoading) return <div className="h-96 animate-pulse rounded-panel bg-sunken" />;

  // Server errors on fields that aren't inputs (tags) would otherwise block every later submit.
  const submit = (status: JobForm['status']) => (e?: React.BaseSyntheticEvent) => {
    clearErrors();
    return save$(status)(e);
  };
  const save$ = (status: JobForm['status']) =>
    handleSubmit((v) =>
      save.mutate(
        { id: id ?? undefined, body: { ...v, status, salaryMin: v.salaryMin ? Number(v.salaryMin) : null, salaryMax: v.salaryMax ? Number(v.salaryMax) : null } },
        {
          onSuccess: (saved) => { toast(status === 'OPEN' ? 'Job is live.' : status === 'DRAFT' ? 'Draft saved.' : 'Job closed.'); navigate(`/employer/jobs/${saved.id}`); },
          onError: (e) => { if (e instanceof ApiError && e.fields) for (const [f, m] of Object.entries(e.fields)) setError(f as keyof JobForm, { message: m }); else toast(e.message, { tone: 'error' }); },
        },
      ),
    );

  return (
    <div className="max-w-3xl">
      <PageTitle sub="Clear titles, a real pay range and how the team works get the best applicants.">{id ? 'Edit job' : 'Post a job'}</PageTitle>
      <form noValidate onSubmit={submit('OPEN')} className="mt-8 flex flex-col gap-5 rounded-panel border border-rule bg-surface p-5 sm:p-6">
        <TextField label="Job title" placeholder="e.g. Junior SOC Analyst" error={errors.title?.message} {...register('title')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Work setup" {...register('remoteType')}>{REMOTE_TYPES.map((r) => <option key={r} value={r}>{REMOTE_LABELS[r]}</option>)}</SelectField>
          <SelectField label="Job type" {...register('jobType')}>{JOB_TYPES.map((r) => <option key={r} value={r}>{JOB_TYPE_LABELS[r]}</option>)}</SelectField>
          <SelectField label="Hiring from" {...register('region')}>{REGIONS.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}</SelectField>
        </div>
        {remote !== 'REMOTE' && <TextField label="Office location" placeholder="City, country" error={errors.location?.message} {...register('location')} />}
        <fieldset className="grid grid-cols-[1fr_1fr_110px] gap-3">
          <legend className="mb-2 text-sm font-medium">Yearly pay range (optional, but posts with pay get more applicants)</legend>
          <TextField label="From" inputMode="numeric" placeholder="45000" error={errors.salaryMin?.message} {...register('salaryMin')} />
          <TextField label="To" inputMode="numeric" placeholder="65000" error={errors.salaryMax?.message} {...register('salaryMax')} />
          <SelectField label="Currency" {...register('currency')}>{['USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}</SelectField>
        </fieldset>
        <div>
          <label htmlFor="tag" className="text-sm font-medium">Skill tags</label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sunken py-1 pl-3 pr-1 text-sm">{t}
                <button type="button" aria-label={`Remove ${t}`} onClick={() => setValue('tags', tags.filter((x) => x !== t))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-rule"><X size={12} /></button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input id="tag" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} placeholder="e.g. splunk, press Enter" className="h-10 flex-1 rounded-control border border-rule-strong bg-surface px-3 text-base focus:border-ink focus:outline-none sm:text-sm" />
            <Button onClick={addTag}>Add</Button>
          </div>
          {errors.tags && <p role="alert" className="mt-1 text-sm text-danger">{errors.tags.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="text-sm font-medium">Description</label>
          <p className="text-xs text-ink-muted">Leave a blank line between paragraphs. Start lines with “- ” for a list, and end a line with “:” to make it a heading.</p>
          <textarea id="description" rows={14} className={`rounded-control border bg-surface px-3 py-2 font-[inherit] text-base leading-relaxed focus:border-ink focus:outline-none sm:text-sm ${errors.description ? 'border-danger' : 'border-rule-strong'}`} {...register('description')} />
          {errors.description && <p role="alert" className="text-sm text-danger">{errors.description.message}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-rule pt-5">
          {job?.status === 'OPEN' && <Button variant="ghost" onClick={submit('CLOSED')}>Close to applicants</Button>}
          {job?.status !== 'OPEN' && <Button onClick={submit('DRAFT')} loading={save.isPending && save.variables?.body.status === 'DRAFT'}>Save draft</Button>}
          <Button type="submit" variant="primary" loading={save.isPending && save.variables?.body.status === 'OPEN'}>{job?.status === 'OPEN' ? 'Save changes' : 'Publish job'}</Button>
        </div>
      </form>
    </div>
  );
}
