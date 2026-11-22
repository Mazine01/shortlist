import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, LogOut } from 'lucide-react';
import { useLogout, useMarkRead, useMe, useNotifications } from '../lib/queries';
import { ago } from '../components/bits';
import { SiteFooter } from '../components/SiteFooter';

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-navy" />
        <rect x="7" y="8" width="18" height="3" rx="1.5" fill="#5B6684" />
        <rect x="7" y="14.5" width="18" height="3" rx="1.5" fill="#F0612A" />
        <rect x="7" y="21" width="11" height="3" rx="1.5" fill="#5B6684" />
      </svg>
      <span className="text-lg font-semibold tracking-tight">Shortlist</span>
    </span>
  );
}

const link = ({ isActive }: { isActive: boolean }) =>
  `flex h-9 shrink-0 items-center rounded-control px-3 text-sm font-medium transition-colors ${isActive ? 'bg-sunken text-ink' : 'text-ink-muted hover:text-ink'}`;

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const nav =
    me?.role === 'EMPLOYER'
      ? [['/employer', 'Hiring'], ['/employer/company', 'Company'], ['/', 'Job board']]
      : me?.role === 'ADMIN'
        ? [['/admin', 'Moderation'], ['/', 'Job board']]
        : [['/', 'Find jobs'], ...(me ? [['/me/applications', 'Applications'], ['/me/saved', 'Saved'], ['/me/profile', 'Profile']] : [])];

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-control bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 sm:px-6">
          <Link to={me?.role === 'EMPLOYER' ? '/employer' : me?.role === 'ADMIN' ? '/admin' : '/'} aria-label="Shortlist home"><Logo /></Link>
          <nav aria-label="Main" className="ml-4 hidden gap-1 md:flex">
            {nav.map(([to, label]) => <NavLink key={to} to={to} end className={link}>{label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {me ? (
              <>
                <Bell_ />
                <span className="hidden px-2 text-sm text-ink-muted lg:inline">{me.name}</span>
                <button type="button" aria-label="Sign out" onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })} className="grid h-9 w-9 place-items-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="h-9 rounded-control px-3 text-sm font-medium leading-9 hover:bg-sunken">Sign in</Link>
                <Link to="/register?role=EMPLOYER" className="hidden h-9 rounded-control border border-rule-strong px-3 text-sm font-medium leading-9 hover:bg-sunken sm:block">Post a job</Link>
              </>
            )}
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          {nav.map(([to, label]) => <NavLink key={to} to={to} end className={link}>{label}</NavLink>)}
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-20 pt-8 sm:px-6">{children}</main>
      <SiteFooter className="bg-surface" />
    </div>
  );
}

function Bell_() {
  const { data } = useNotifications(true);
  const markRead = useMarkRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative grid h-9 w-9 place-items-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink">
        <Bell size={18} />
        {unread > 0 && <span className="tabular absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink">{unread}</span>}
      </button>
      {open && (
        <div className="animate-pop-in absolute right-0 top-11 z-40 w-[min(360px,calc(100vw-32px))] rounded-panel border border-rule bg-surface shadow-panel">
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && <button type="button" onClick={() => markRead.mutate(undefined)} className="text-xs font-medium text-ink-muted underline hover:text-ink">Mark all read</button>}
          </div>
          {data?.data.length ? (
            <ul className="max-h-96 overflow-y-auto">
              {data.data.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read) markRead.mutate(n.id);
                      setOpen(false);
                      navigate(n.link);
                    }}
                    className="flex w-full gap-3 border-b border-rule px-4 py-3 text-left last:border-0 hover:bg-sunken/60"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand'}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className={`block text-sm ${n.read ? 'text-ink-muted' : 'font-medium'}`}>{n.text}</span>
                      <span className="text-xs text-ink-muted">{ago(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">Nothing new. Updates on your applications and jobs show up here.</p>
          )}
        </div>
      )}
    </div>
  );
}
