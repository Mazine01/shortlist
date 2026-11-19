import { useParams } from 'react-router-dom';
import { CompanyMark, Empty, Verified } from '../../components/bits';
import { useCompany } from '../../lib/queries';
import { JobRow } from './JobsPage';

export function CompanyPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useCompany(slug);
  if (isLoading) return <div className="h-64 animate-pulse rounded-panel bg-sunken" />;
  if (error || !data) return <Empty title="Company not found." />;
  const c = data.data;
  return (
    <>
      <div className="flex items-center gap-5">
        <CompanyMark company={c} size={72} />
        <div>
          <h1 className="flex items-center gap-2 text-[32px] font-semibold tracking-tight">{c.name}<Verified company={c} /></h1>
          <p className="text-ink-muted">{c.size} people{c.website && <> · <a href={c.website} target="_blank" rel="noreferrer noopener" className="underline">{c.website.replace(/^https:\/\//, '')}</a></>}</p>
        </div>
      </div>
      <p className="mt-6 max-w-prose leading-relaxed text-ink-muted">{c.about}</p>
      <h2 className="mt-10 font-semibold">{data.jobs.length} open {data.jobs.length === 1 ? 'role' : 'roles'}</h2>
      <ul className="mt-4 flex flex-col gap-3">{data.jobs.map((j) => <JobRow key={j.id} job={j} />)}</ul>
    </>
  );
}
