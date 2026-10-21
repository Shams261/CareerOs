import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { db, owner } from '@/server/db';
import { ResourceLink } from '@/components/resource-link';
import { Disclosure } from '@/components/disclosure';
import { InterviewMentions } from '@/features/jobs/summary';
import { AttemptForm, ProblemForm, RevisionForm } from '@/features/dsa/forms';
import { revisionDay, solvedText } from '@/features/dsa/domain';
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
        ← Practice
      </Link>
      <p className="eyebrow mt-5">
        {p.topic.name} · {p.platform} · {p.difficulty.toLowerCase()}
      </p>
      <h1>{p.title}</h1>
      <section className="card">
        <div className="row flex-wrap">
          <span
            className={`pill ${p.attemptsCount ? p.confidence.toLowerCase() : ''}`}
          >
            {p.attemptsCount ? p.confidence : 'Unattempted'}
          </span>
          <ResourceLink url={p.problemUrl}>Open problem</ResourceLink>
        </div>
        <p className="mt-4">Last attempt: {date(p.lastAttemptedAt)}</p>
        <p>
          Next revision:{' '}
          {p.nextRevisionAt ? revisionDay(p.nextRevisionAt) : 'Not scheduled'}
          {p.revisionManual ? ' (set by hand)' : ''}
        </p>
        <p className="muted">
          {p.attemptsCount} attempt{p.attemptsCount === 1 ? '' : 's'} · Green
          revisions in a row: {p.revisionStage} of 3
        </p>
        {p.notes && <p className="mt-4">{p.notes}</p>}
        {p.resources.map((r) => (
          <p className="mt-3" key={r.id}>
            <ResourceLink url={r.url}>{r.title}</ResourceLink>
          </p>
        ))}
        {p.attemptsCount > 0 && (
          <Disclosure
            variant="link"
            label="Change revision date"
            className="mt-4"
          >
            <RevisionForm problem={p} />
          </Disclosure>
        )}
      </section>
      <section className="card" aria-labelledby="attempt-heading">
        <h2 id="attempt-heading">Record an attempt</h2>
        <AttemptForm problemId={p.id} />
      </section>
      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading">Attempts</h2>
        {legacy > 0 && (
          <p className="muted">
            {legacy} earlier attempt{legacy === 1 ? '' : 's'} without details.
          </p>
        )}
        {!p.attempts.length && <p className="muted">No attempts yet.</p>}
        {p.attempts.map((a) => (
          <article className="dsa-item" key={a.id}>
            <h3>{date(a.attemptedAt)}</h3>
            <p>
              {a.confidenceBefore ? `${a.confidenceBefore} → ` : ''}
              {a.confidenceAfter} · {solvedText[a.solvedIndependently]}
              {a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}
            </p>
            {a.mistake && (
              <p className="mt-3">
                <strong>What I missed:</strong> {a.mistake}
              </p>
            )}
            {a.notes && <p className="mt-3">{a.notes}</p>}
            {a.actualSessionId && (
              <p className="muted">Linked to a recorded session.</p>
            )}
          </article>
        ))}
      </section>
      <InterviewMentions userId={user.id} dsaProblemId={p.id} />
      <Disclosure label="Edit problem">
        <section className="card">
          <ProblemForm problem={p} topics={topics} />
        </section>
      </Disclosure>
    </>
  );
}
