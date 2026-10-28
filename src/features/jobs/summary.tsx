import Link from 'next/link';
import { db } from '@/server/db';

/** Read-only backlink from learning/DSA pages to interview prep and weak areas that reference them. */
export async function InterviewMentions({
  userId,
  learningTopicId,
  dsaProblemId,
}: {
  userId: string;
  learningTopicId?: string;
  dsaProblemId?: string;
}) {
  const items = await db().interviewPrepItem.findMany({
    where: {
      userId,
      round: { userId },
      ...(learningTopicId ? { learningTopicId } : { dsaProblemId }),
    },
    include: { round: { include: { application: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  if (!items.length) return null;
  return (
    <section className="card" aria-label="Interview mentions">
      <h2>Interview mentions</h2>
      <ul className="plain-list">
        {items.map((i) => (
          <li className="dsa-item" key={i.id}>
            <Link
              prefetch={false}
              className="link"
              href={`/jobs/${i.round.applicationId}#round-${i.round.id}`}
            >
              {i.round.application.company} — {i.round.title}
            </Link>
            <p className="muted">
              {i.kind === 'GAP' ? 'Weak area' : 'Prep'}: {i.title} ·{' '}
              {i.completed ? 'done' : 'open'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
