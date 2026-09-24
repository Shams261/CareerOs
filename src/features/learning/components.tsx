import Link from 'next/link';
import {
  calendarDate,
  dueState,
  statusLabel,
  type ReviewTopic,
} from './domain';
export function TopicList({
  topics,
  day,
}: {
  topics: (ReviewTopic & {
    title: string;
    subject: { name: string; status: string };
    parentId?: string | null;
  })[];
  day: string;
}) {
  return topics.length ? (
    <ul className="dsa-list">
      {topics.map((t) => (
        <li className="dsa-item" key={t.id}>
          <div>
            <Link className="link" href={`/learn/topics/${t.id}`}>
              {t.parentId ? '↳ ' : ''}
              {t.title}
            </Link>
            <p className="muted">
              {t.subject.name} · {statusLabel(t.status)}
            </p>
          </div>
          <span className="muted">
            {t.nextReviewDate
              ? `${calendarDate(t.nextReviewDate)} · ${dueState(t, day)}`
              : 'Not scheduled'}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="muted">No topics in this view.</p>
  );
}
