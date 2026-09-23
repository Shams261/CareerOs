import { db, owner } from '@/server/db';
import { ResourceLink } from '@/components/resource-link';
export default async function Learn() {
  const user = await owner();
  const topics = await db().learningTopic.findMany({
    where: { userId: user.id },
    include: { resources: true, goal: true },
    orderBy: { title: 'asc' },
  });
  return (
    <>
      <p className="eyebrow">A growing toolkit</p>
      <h1>Stay curious. Go deeper.</h1>
      <p className="muted mb-7">
        Your learning library · topic editing arrives in a later work item.
      </p>
      {topics.map((t) => (
        <section className="card" key={t.id}>
          <div className="row">
            <h2>{t.title}</h2>
            <span className="pill">{t.status.replaceAll('_', ' ')}</span>
          </div>
          <p className="muted">
            {t.goal?.title ?? 'Independent learning'} · {t.notes}
          </p>
          {t.resources.map((r) => (
            <p key={r.id} className="mt-4">
              <ResourceLink url={r.url}>{r.title}</ResourceLink>
            </p>
          ))}
        </section>
      ))}
      {!topics.length && <div className="empty">No learning topics yet.</div>}
    </>
  );
}
