'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="card" role="alert">
      <h1>We couldn’t load your workspace.</h1>
      <p className="muted mb-5">
        Check the database connection and initial setup, then try again. Saved
        data remains in PostgreSQL.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
