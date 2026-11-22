import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from '@shortlist/shared';
import { Spinner } from '../components/ui/Button';
import { useMe } from '../lib/queries';
import { AuthPage } from '../features/auth/AuthPage';
import { JobsPage } from '../features/jobs/JobsPage';
import { JobPage } from '../features/jobs/JobPage';
import { CompanyPage } from '../features/jobs/CompanyPage';
import { ApplicationsPage, ProfilePage, SavedPage } from '../features/seeker/SeekerPages';
import { CompanyForm, EmployerDashboard, JobEditor } from '../features/employer/EmployerPages';
import { PipelinePage } from '../features/employer/PipelinePage';
import { AdminPage } from '../features/admin/AdminPage';
import { AppShell } from './AppShell';
import { LegalPage } from '../features/legal/LegalPage';

/** Client-side guard for navigation only; the API enforces every role on its own. */
function Only({ role, children }: { role: Role; children: React.ReactNode }) {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <div className="grid h-64 place-items-center text-ink-muted"><Spinner className="h-6 w-6" /></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobPage />} />
        <Route path="/companies/:slug" element={<CompanyPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/privacy" element={<LegalPage doc="privacy" />} />
        <Route path="/terms" element={<LegalPage doc="terms" />} />
        <Route path="/cookies" element={<LegalPage doc="cookies" />} />
        <Route path="/me/profile" element={<Only role="SEEKER"><ProfilePage /></Only>} />
        <Route path="/me/applications" element={<Only role="SEEKER"><ApplicationsPage /></Only>} />
        <Route path="/me/saved" element={<Only role="SEEKER"><SavedPage /></Only>} />
        <Route path="/employer" element={<Only role="EMPLOYER"><EmployerDashboard /></Only>} />
        <Route path="/employer/company" element={<Only role="EMPLOYER"><CompanyForm /></Only>} />
        <Route path="/employer/jobs/new" element={<Only role="EMPLOYER"><JobEditor /></Only>} />
        <Route path="/employer/jobs/:id/edit" element={<Only role="EMPLOYER"><JobEditor /></Only>} />
        <Route path="/employer/jobs/:id" element={<Only role="EMPLOYER"><PipelinePage /></Only>} />
        <Route path="/admin" element={<Only role="ADMIN"><AdminPage /></Only>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
