import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminStats,
  Applicant,
  AppStatus,
  Company,
  CompanyBrief,
  CompanyInput,
  EmployerJob,
  Job,
  JobCard,
  JobInput,
  JobSearch,
  LoginInput,
  MyApplication,
  Notification,
  Paginated,
  ProfileInput,
  RegisterInput,
  SeekerProfile,
  User,
} from '@shortlist/shared';
import { api, ApiError } from './api';

type QC = ReturnType<typeof useQueryClient>;
const refresh = (qc: QC, ...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('/api/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api<{ user: User }>('/api/auth/login', { method: 'POST', body: input }),
    onSuccess: ({ user }) => {
      qc.setQueryData(['me'], user);
      return refresh(qc, 'jobs', 'job');
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => api<{ user: User }>('/api/auth/register', { method: 'POST', body: input }),
    onSuccess: ({ user }) => qc.setQueryData(['me'], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });
}

export function useJobs(query: JobSearch) {
  return useQuery({
    queryKey: ['jobs', query],
    queryFn: () => api<Paginated<JobCard>>('/api/jobs', { query: query as Record<string, unknown> }),
    placeholderData: keepPreviousData,
  });
}

export function useTags() {
  return useQuery({ queryKey: ['tags'], queryFn: async () => (await api<{ data: { tag: string; n: number }[] }>('/api/tags')).data, staleTime: 10 * 60 * 1000 });
}

export function useJob(id: number) {
  return useQuery({ queryKey: ['job', id], queryFn: async () => (await api<{ data: Job }>(`/api/jobs/${id}`)).data });
}

export function useCompany(slug: string) {
  return useQuery({ queryKey: ['company', slug], queryFn: () => api<{ data: Company; jobs: JobCard[] }>(`/api/companies/${slug}`) });
}

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => api<{ data: SeekerProfile | null; resume: SeekerProfile['resume'] }>('/api/me/profile'),
    enabled,
  });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileInput) => api('/api/me/profile', { method: 'PUT', body }),
    onSuccess: () => refresh(qc, 'profile', 'me'),
  });
}

export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/me/resume`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent(file.name) },
        body: file,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'UPLOAD', data?.error?.message ?? (res.status === 413 ? 'That file is over 5 MB.' : 'Upload failed.'));
      return data;
    },
    onSuccess: () => refresh(qc, 'profile'),
  });
}

export function useApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, coverNote }: { jobId: number; coverNote: string }) => api(`/api/me/jobs/${jobId}/apply`, { method: 'POST', body: { coverNote } }),
    onSuccess: () => refresh(qc, 'job', 'jobs', 'applications'),
  });
}

export function useMyApplications(enabled = true) {
  return useQuery({ queryKey: ['applications'], queryFn: async () => (await api<{ data: MyApplication[] }>('/api/me/applications')).data, enabled });
}

export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/api/me/applications/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(qc, 'applications', 'job', 'jobs'),
  });
}

export function useSaved(enabled = true) {
  return useQuery({ queryKey: ['saved'], queryFn: async () => (await api<{ data: JobCard[] }>('/api/me/saved')).data, enabled });
}

export function useToggleSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, save }: { jobId: number; save: boolean }) => api(`/api/me/saved/${jobId}`, { method: save ? 'PUT' : 'DELETE' }),
    onSuccess: () => refresh(qc, 'saved', 'jobs', 'job'),
  });
}

export function useMyCompany(enabled = true) {
  return useQuery({ queryKey: ['my-company'], queryFn: async () => (await api<{ data: (CompanyBrief & { website: string | null; about: string; size: string }) | null }>('/api/employer/company')).data, enabled });
}

export function useSaveCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CompanyInput) => api('/api/employer/company', { method: 'PUT', body }),
    onSuccess: () => refresh(qc, 'my-company', 'me', 'employer-jobs'),
  });
}

export function useEmployerJobs(enabled = true) {
  return useQuery({ queryKey: ['employer-jobs'], queryFn: async () => (await api<{ data: EmployerJob[] }>('/api/employer/jobs')).data, enabled });
}

export function useEmployerJob(id: number | null) {
  return useQuery({ queryKey: ['employer-job', id], queryFn: async () => (await api<{ data: Job }>(`/api/employer/jobs/${id}`)).data, enabled: id !== null });
}

export function useSaveJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id?: number; body: JobInput }) =>
      (await api<{ data: Job }>(id ? `/api/employer/jobs/${id}` : '/api/employer/jobs', { method: id ? 'PUT' : 'POST', body })).data,
    onSuccess: () => refresh(qc, 'employer-jobs', 'employer-job', 'jobs', 'job', 'tags'),
  });
}

export function useApplicants(jobId: number) {
  return useQuery({ queryKey: ['applicants', jobId], queryFn: async () => (await api<{ data: Applicant[] }>(`/api/employer/jobs/${jobId}/applicants`)).data });
}

export function useUpdateApplicant(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; status?: AppStatus; employerNote?: string }) => api(`/api/employer/applications/${id}`, { method: 'PATCH', body }),
    // Move the card on the board right away; roll back if the server says no.
    onMutate: async ({ id, status, employerNote }) => {
      await qc.cancelQueries({ queryKey: ['applicants', jobId] });
      const prev = qc.getQueryData<Applicant[]>(['applicants', jobId]);
      qc.setQueryData<Applicant[]>(['applicants', jobId], (list) =>
        list?.map((a) => (a.id === id ? { ...a, ...(status && { status }), ...(employerNote !== undefined && { employerNote }) } : a)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['applicants', jobId], ctx.prev),
    onSettled: () => refresh(qc, 'applicants', 'employer-jobs'),
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ data: Notification[]; unread: number }>('/api/notifications'),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id?: number) => api('/api/notifications/read', { method: 'POST', body: { id } }), onSuccess: () => refresh(qc, 'notifications') });
}

export function useAdminStats() {
  return useQuery({ queryKey: ['admin', 'stats'], queryFn: async () => (await api<{ data: AdminStats }>('/api/admin/stats')).data });
}
export function useAdminList<T>(what: 'companies' | 'jobs' | 'users', q = '') {
  return useQuery({ queryKey: ['admin', what, q], queryFn: async () => (await api<{ data: T[] }>(`/api/admin/${what}`, { query: { q: q || undefined } })).data, placeholderData: keepPreviousData });
}
export function useAdminFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, value }: { path: string; value: boolean }) => api(`/api/admin/${path}`, { method: 'PUT', body: { value } }),
    onSuccess: () => refresh(qc, 'admin', 'jobs'),
  });
}
