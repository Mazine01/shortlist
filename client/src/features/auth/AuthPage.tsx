import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, UserRound } from 'lucide-react';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput, type User } from '@shortlist/shared';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { useLogin, useMe, useRegister } from '../../lib/queries';

const home = (u: User) => (u.role === 'EMPLOYER' ? (u.hasCompany ? '/employer' : '/employer/company') : u.role === 'ADMIN' ? '/admin' : u.hasProfile ? '/' : '/me/profile');

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { data: me } = useMe();
  const from = (useLocation().state as { from?: string } | null)?.from;
  if (me) return <Navigate to={from ?? home(me)} replace />;
  return (
    <div className="mx-auto max-w-md pt-6">
      <h1 className="text-[32px] font-semibold tracking-tight">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
      {mode === 'login' ? <Login from={from} /> : <Register from={from} />}
    </div>
  );
}

function Login({ from }: { from?: string }) {
  const login = useLogin();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  return (
    <>
      <form noValidate className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit((v) => login.mutate(v, { onSuccess: ({ user }) => navigate(from ?? home(user), { replace: true }) }))}>
        {login.error && <p role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">{login.error instanceof ApiError ? login.error.message : 'Sign-in failed.'}</p>}
        <TextField label="Email" type="email" autoComplete="username" autoFocus error={errors.email?.message} {...register('email')} />
        <TextField label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <Button type="submit" variant="primary" loading={login.isPending} className="h-11">Sign in</Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">New here? <Link to="/register" state={{ from }} className="font-medium text-ink underline">Create an account</Link></p>
      <div className="mt-8 rounded-control bg-sunken p-4 text-sm text-ink-muted">
        <p className="font-medium text-ink">Demo accounts (password Shortlist!2026)</p>
        <p className="mt-1">seeker@shortlist.dev · employer@shortlist.dev · admin@shortlist.dev</p>
      </div>
    </>
  );
}

function Register({ from }: { from?: string }) {
  const signUp = useRegister();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: params.get('role') === 'EMPLOYER' ? 'EMPLOYER' : 'SEEKER' },
  });
  const role = watch('role');
  return (
    <form
      noValidate
      className="mt-8 flex flex-col gap-5"
      onSubmit={handleSubmit((v) =>
        signUp.mutate(v, {
          onSuccess: ({ user }) => navigate(user.role === 'SEEKER' ? '/me/profile' : '/employer/company', { replace: true, state: { from } }),
          onError: (e) => { if (e instanceof ApiError && e.fields) for (const [f, m] of Object.entries(e.fields)) setError(f as keyof RegisterInput, { message: m }); },
        }),
      )}
    >
      <fieldset>
        <legend className="text-sm font-medium">I’m here to</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([['SEEKER', 'Find a job', UserRound], ['EMPLOYER', 'Hire people', Briefcase]] as const).map(([v, l, Icon]) => (
            <label key={v} className={`flex cursor-pointer flex-col gap-2 rounded-panel border-2 p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${role === v ? 'border-brand bg-brand-soft/40' : 'border-rule hover:border-rule-strong'}`}>
              <input type="radio" value={v} className="sr-only" {...register('role')} />
              <Icon size={22} className={role === v ? 'text-brand' : 'text-ink-muted'} aria-hidden="true" />
              <span className="font-semibold">{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextField label="Your name" autoComplete="name" error={errors.name?.message} {...register('name')} />
      <TextField label={role === 'EMPLOYER' ? 'Work email' : 'Email'} type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <TextField label="Password" type="password" autoComplete="new-password" hint="At least 8 characters" error={errors.password?.message} {...register('password')} />
      <Button type="submit" variant="primary" loading={signUp.isPending} className="h-11">Create account</Button>
      <p className="text-sm text-ink-muted">Already have one? <Link to="/login" className="font-medium text-ink underline">Sign in</Link></p>
    </form>
  );
}
