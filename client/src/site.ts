import type { DocKey, LegalDoc } from './features/legal/documents';

export interface SiteInfo {
  name: string;
  tagline: string;
  product: string;
  owner: string;
  ownerUrl: string;
  /** Set VITE_CONTACT_EMAIL to show an email address; otherwise Contact links to the owner's GitHub. */
  contactEmail?: string;
  demoNotice: string;
  collected: { heading: string; items: string[] }[];
  uses: string[];
  sharing: string[];
  extraRules: string[];
  cookieName: string;
  storage: { key: string; purpose: string }[];
  footerWidth: string;
  columns: { title: string; links: { label: string; to: string }[] }[];
  extraDocs?: Partial<Record<DocKey, LegalDoc>>;
}

const OWNER = { owner: "M'hammed Mazin", ownerUrl: 'https://github.com/Mazine01', contactEmail: import.meta.env.VITE_CONTACT_EMAIL as string | undefined };

export const SITE: SiteInfo = {
  ...OWNER,
  name: 'Shortlist',
  tagline: 'Remote and async-friendly jobs in security, engineering and data, with the pay range up front.',
  product: 'a job board for remote and async-friendly roles',
  demoNotice: 'The job listings and companies in the public demo are sample data.',
  collected: [
    { heading: 'Every account:', items: ['name, email and whether you are a job seeker or an employer', 'a hashed password'] },
    { heading: 'Job seekers:', items: ['your headline, location, region and skills', 'your resume (PDF) and the applications and notes you send'] },
    { heading: 'Employers:', items: ['your company profile and job posts', 'the hiring stage and private notes you keep on applicants'] },
  ],
  uses: ['to sign you in and keep your session secure', 'to show jobs, send applications and move them through hiring stages', 'to notify you when something changes on an application or job'],
  sharing: [
    'Your profile and resume are shared only with employers you apply to.',
    'Employers’ private notes are never shown to candidates.',
    'Moderators can view accounts and job posts to keep the board safe.',
  ],
  extraRules: ['post jobs that are misleading, discriminatory or not real;', 'contact candidates for anything other than the job they applied to.'],
  cookieName: 'shortlist_session',
  storage: [],
  footerWidth: 'max-w-[1200px]',
  columns: [
    { title: 'Job seekers', links: [{ label: 'Browse jobs', to: '/' }, { label: 'Saved jobs', to: '/me/saved' }, { label: 'Your applications', to: '/me/applications' }] },
    { title: 'Employers', links: [{ label: 'Post a job', to: '/register?role=EMPLOYER' }, { label: 'Hiring dashboard', to: '/employer' }] },
  ],
};
