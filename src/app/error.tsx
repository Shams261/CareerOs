'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Any route error lands here; the digest ties it to the server log without exposing details. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="card" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>This page could not be loaded.</h1>
      <p className="muted mb-5">
        Nothing you saved is lost. Try again, or go back to Today.
        {error.digest ? ` Reference ${error.digest}.` : ''}
      </p>
      <div className="actions">
        <Button onClick={reset}>Try again</Button>
        <Link prefetch={false} className="button secondary" href="/today">
          Back to Today
        </Link>
      </div>
    </section>
  );
}
