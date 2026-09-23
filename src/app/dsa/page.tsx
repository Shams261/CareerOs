import { db, owner } from '@/server/db';
import { ResourceLink } from '@/components/resource-link';
import { formatInTimeZone } from 'date-fns-tz';
export default async function Dsa() {
  const user = await owner();
  const problems = await db().dsaProblem.findMany({
    where: { userId: user.id },
    include: { topic: true, resources: true },
    orderBy: { nextRevisionAt: 'asc' },
  });
  const date = (d: Date | null) =>
    d ? formatInTimeZone(d, user.timezone, 'MMM d, yyyy') : 'Not yet';
  return (
    <>
      <p className="eyebrow">Practice with intention</p>
      <h1>Patterns over memorization.</h1>
      <p className="muted mb-7">Build confidence one problem at a time.</p>
      {!problems.length && (
        <div className="empty">
          No problems yet. Run the example seed to explore the DSA foundation.
        </div>
      )}
      {problems.map((p) => (
        <section className="card" key={p.id}>
          <p className="eyebrow mb-3">
            {p.topic.name} · {p.platform}
          </p>
          <h2>{p.title}</h2>
          <div className="row">
            <div className="flex gap-2">
              <span className="pill">{p.difficulty}</span>
              <span className={`pill ${p.confidence.toLowerCase()}`}>
                {p.confidence} confidence
              </span>
            </div>
            <ResourceLink url={p.problemUrl}>Open problem</ResourceLink>
          </div>
          <p className="muted mt-5">
            Last attempt: {date(p.lastAttemptedAt)} · Next revision:{' '}
            {date(p.nextRevisionAt)} · {p.attemptsCount} attempts
          </p>
          <p className="muted mt-3">{p.notes}</p>
          {p.resources.map((r) => (
            <p className="mt-3" key={r.id}>
              <ResourceLink url={r.url}>{r.title}</ResourceLink>
            </p>
          ))}
        </section>
      ))}
      <p className="muted">
        Red: need guidance · Yellow: still practicing · Green: independently
        confident
      </p>
    </>
  );
}
