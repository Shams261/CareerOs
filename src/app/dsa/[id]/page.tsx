import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { db, owner } from '@/server/db';
import { ResourceLink } from '@/components/resource-link';
import { AttemptForm, ProblemForm, RevisionForm } from '@/features/dsa/forms';
import { revisionDay } from '@/features/dsa/domain';
export default async function Problem({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await owner(),
    { id } = await params;
  const p = await db().dsaProblem.findFirst({
    where: { id, userId: user.id },
    include: {
      topic: true,
      resources: true,
      attempts: { orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }] },
    },
  });
  if (!p) notFound();
  const topics = await db().dsaTopic.findMany({
    orderBy: [{ ordering: 'asc' }, { name: 'asc' }],
  });
  const date = (d: Date | null) =>
    d ? formatInTimeZone(d, user.timezone, 'MMM d, yyyy · h:mm a') : 'Not yet';
  const legacy = p.attemptsCount - p.attempts.length;
  return (
    <>
      <Link className="link" href="/dsa">
        ← DSA queue
      </Link>
      <p className="eyebrow mt-5">
        {p.topic.name} · {p.platform} · {p.difficulty}
      </p>
      <h1>{p.title}</h1>
      <section className="card">
        <div className="row flex-wrap">
          <span
            className={`pill ${p.attemptsCount ? p.confidence.toLowerCase() : ''}`}
          >
            {p.attemptsCount ? p.confidence : 'Unattempted'}
          </span>
          <ResourceLink url={p.problemUrl}>Open Problem</ResourceLink>
        </div>
        <p className="mt-4">Last attempt: {date(p.lastAttemptedAt)}</p>
        <p>
          Next revision:{' '}
          {p.nextRevisionAt ? revisionDay(p.nextRevisionAt) : 'Not scheduled'}{' '}
          {p.revisionManual ? '(manually scheduled)' : ''}
        </p>
        <p className="muted">
          {p.attemptsCount} attempts · Green progression {p.revisionStage}/3 ·
          Dates use {user.timezone}
        </p>
        {p.notes && <p className="mt-4">{p.notes}</p>}
        {p.resources.map((r) => (
          <p className="mt-3" key={r.id}>
            <ResourceLink url={r.url}>{r.title}</ResourceLink>
          </p>
        ))}
      </section>
      <section className="card">
        <h2>Record attempt</h2>
        <p className="muted">
          Saved at the current time. A running DSA session is linked
          automatically; a timer is optional.
        </p>
        <AttemptForm problemId={p.id} />
      </section>
      <section className="card">
        <h2>Attempt history</h2>
        {legacy > 0 && (
          <p className="muted">
            {legacy} earlier attempt(s) recorded in the legacy summary. Detailed
            history was not captured; it has not been reconstructed.
          </p>
        )}
        {!p.attempts.length && (
          <p className="muted">No detailed attempts recorded yet.</p>
        )}
        {p.attempts.map((a) => (
          <article className="dsa-item" key={a.id}>
            <h3>{date(a.attemptedAt)}</h3>
            <p>
              {a.solvedIndependently} ·{' '}
              {a.confidenceBefore ? `${a.confidenceBefore} → ` : ''}
              {a.confidenceAfter}
              {a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}
            </p>
            {a.mistake && (
              <p className="mt-3">
                <strong>What I missed:</strong> {a.mistake}
              </p>
            )}
            {a.notes && <p className="mt-3">{a.notes}</p>}
            {a.actualSessionId && (
              <p className="muted">Linked to an actual DSA session.</p>
            )}
          </article>
        ))}
      </section>
      {p.attemptsCount > 0 && (
        <section className="card">
          <details>
            <summary>Schedule revision manually</summary>
            <p className="muted">
              Changes the due date only. Your next attempt resumes automatic
              scheduling.
            </p>
            <RevisionForm problem={p} />
          </details>
        </section>
      )}
      <section className="card">
        <details>
          <summary>Edit problem</summary>
          <ProblemForm problem={p} topics={topics} />
        </details>
      </section>
    </>
  );
}
