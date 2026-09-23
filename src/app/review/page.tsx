import Link from 'next/link';
import { db, owner } from '@/server/db';
export default async function Review() {
  const user = await owner();
  const plans = await db().dailyPlan.findMany({
    where: { userId: user.id },
    include: { blocks: true, checkIn: true },
    orderBy: { date: 'desc' },
    take: 7,
  });
  return (
    <>
      <p className="eyebrow">Notice the progress</p>
      <h1>Consistency starts with reflection.</h1>
      <p className="muted mb-7">
        Your latest seven planned days. Full weekly analysis is reserved for a
        later work item.
      </p>
      <section className="card">
        <h2>Recent days</h2>
        {plans.map((p) => (
          <div className="row py-4 border-b border-stone-100" key={p.id}>
            <div>
              <h3>
                <Link
                  className="link"
                  href={`/today?date=${p.date.toISOString().slice(0, 10)}`}
                >
                  {p.date.toISOString().slice(0, 10)}
                </Link>
              </h3>
              <p className="muted">
                {p.blocks.filter((b) => b.status === 'COMPLETED').length}{' '}
                completed ·{' '}
                {p.blocks.filter((b) => b.status === 'SKIPPED').length} skipped
              </p>
            </div>
            <span className="pill">
              {p.checkIn
                ? 'Checked in'
                : p.reviewedAt
                  ? 'Reviewed'
                  : 'Not reviewed'}
            </span>
          </div>
        ))}
        {!plans.length && (
          <div className="empty">
            Your first review starts with today’s plan.
          </div>
        )}
      </section>
    </>
  );
}
