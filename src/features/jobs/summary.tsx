import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/features/schedule/service';
import { ResourceLink } from '@/components/resource-link';
import { interviewTime, label } from './domain';
import { jobTodaySummary, todaysInterviews } from './service';

/** Interviews scheduled for this owner-calendar day. Never edits TimeBlocks. */
export async function TodayInterview({
  user,
  day,
}: {
  user: ScheduleUser;
  day: string;
}) {
  const rounds = await todaysInterviews(user, day);
  if (!rounds.length) return null;
  return (
    <section className="hero" aria-label="Today's interview">
      <div className="stack">
        <p className="eyebrow">
          Today&apos;s interview
          {rounds.length > 1 ? `s · ${rounds.length}` : ''}
        </p>
        {rounds.map((r) => (
          <div key={r.id}>
            <h2>
              {r.application.company} — {r.title}
            </h2>
            <p className="muted">
              {label(r.type)} · {interviewTime(r, user.timezone)} ·{' '}
              {r.prepItems.filter((p) => !p.completed).length} prep item(s) open
            </p>
            <div className="actions">
              <Link
                className="button secondary"
                href={`/jobs/${r.applicationId}`}
              >
                Open application
              </Link>
              <Link
                className="button secondary"
                href={`/jobs/${r.applicationId}#round-${r.id}`}
              >
                Open prep
              </Link>
              {r.meetingUrl && (
                <ResourceLink url={r.meetingUrl}>Meeting link</ResourceLink>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Compact attention summary; hidden when there is no open application. */
export async function TodayJobs({
  user,
  now,
}: {
  user: ScheduleUser;
  now: Date;
}) {
  const s = await jobTodaySummary(user, now);
  if (!s) return null;
  return (
    <section className="card" aria-label="Job search">
      <h2>Job search</h2>
      <p>
        Applications requiring action: {s.actionRequired} · Follow-ups due:{' '}
        {s.followUpsDue}
      </p>
      {s.upcoming && (
        <p className="muted">
          Upcoming interview: {s.upcoming.app.company} —{' '}
          {s.upcoming.round.title},{' '}
          {interviewTime(s.upcoming.round, user.timezone)}
        </p>
      )}
      {s.block && (
        <p className="muted">
          Next job search block:{' '}
          {formatInTimeZone(s.block.plannedStart, user.timezone, 'EEE h:mm a')}
        </p>
      )}
      {s.attention.length > 0 && (
        <ul className="plain-list">
          {s.attention.slice(0, 3).map(({ app }) => (
            <li key={app.id}>
              <Link className="link" href={`/jobs/${app.id}`}>
                {app.company}: {app.nextAction ?? label(app.stage)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className="link" href="/jobs">
        Open job search →
      </Link>
    </section>
  );
}

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
      <p className="muted">
        Linked from interview prep or reflections. Mastery and attempts are only
        changed by what you record here.
      </p>
      <ul className="plain-list">
        {items.map((i) => (
          <li className="dsa-item" key={i.id}>
            <Link
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
