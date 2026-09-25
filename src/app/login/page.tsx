import { redirect } from 'next/navigation';
import { currentSession } from '@/server/session';
import { signInAction } from '@/features/auth/actions';
import {
  authErrorMessages,
  safeNext,
  type AuthErrorCode,
} from '@/features/auth/oidc';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Sign in' };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; signed_out?: string }>;
}) {
  const q = await searchParams;
  if (await currentSession()) redirect(safeNext(q.next));
  const error = q.error
    ? (authErrorMessages[q.error as AuthErrorCode] ??
      authErrorMessages.exchange_failed)
    : null;
  return (
    <section className="card login-card" aria-labelledby="login-heading">
      <p className="eyebrow">Private workspace</p>
      <h1 id="login-heading">
        Career<span className="brand-accent">OS</span>
      </h1>
      <p className="muted">
        Sign in with the Google account configured as this workspace&apos;s
        owner.
      </p>
      {error && (
        <p role="alert" className="form-message">
          {error}
        </p>
      )}
      {q.signed_out && (
        <p role="status" className="form-success">
          You are signed out.
        </p>
      )}
      <form action={signInAction}>
        <input type="hidden" name="next" value={safeNext(q.next)} />
        <Button>Sign in with Google</Button>
      </form>
      <p className="muted mt-4">
        Sign-in shares only your email with CareerOS. Google Calendar access is
        a separate, optional step in Calendar.
      </p>
    </section>
  );
}
