import { BrandLogo } from '@/components/brand';
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
      <div className="login-identity">
        <BrandLogo stacked />
      </div>
      <h1 id="login-heading" className="login-heading">
        Plan once.
        <br />
        Show up daily.
      </h1>
      <p className="login-description">
        A calm system for daily execution and steady progress.
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
        <Button>Continue with Google</Button>
      </form>
      <p className="login-continuity">Keep the chain going.</p>
    </section>
  );
}
