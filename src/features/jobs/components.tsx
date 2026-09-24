import Link from 'next/link';
import {
  followUpState,
  interviewTime,
  isOpen,
  label,
  lastActivityDays,
  nextRound,
  type AppLike,
  type Attention,
} from './domain';

type RowApp = AppLike & {
  company: string;
  role: string;
  lastActivityAt: Date;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Plain-text status line: status never depends on color. */
export function nextLine(app: RowApp, now: Date, zone: string, today: string) {
  if (!isOpen(app.stage)) return `Closed · ${label(app.stage)}`;
  const parts: string[] = [];
  const round = nextRound(app.rounds, now);
  if (round) parts.push(`Next: ${round.title} — ${interviewTime(round, zone)}`);
  const follow = followUpState(app, today);
  const action = app.nextAction ?? 'Follow up';
  if (follow.state === 'overdue')
    parts.push(`${action} — overdue by ${plural(follow.days, 'day')}`);
  else if (follow.state === 'today') parts.push(`${action} — due today`);
  else if (follow.state === 'upcoming')
    parts.push(`${action} — due ${follow.date}`);
  else if (app.nextAction) parts.push(app.nextAction);
  if (app.actionOwner === 'COMPANY') {
    const days = lastActivityDays(app.lastActivityAt, now, zone);
    parts.push(
      `Waiting on company · last activity ${days ? `${plural(days, 'day')} ago` : 'today'}`,
    );
  } else if (app.actionOwner === 'ME' && !parts.length)
    parts.push('Action required');
  return parts.join(' · ') || 'No next step set';
}
export function attentionText(a: Attention, zone: string) {
  switch (a.kind) {
    case 'FOLLOW_UP_OVERDUE':
      return `Follow-up overdue by ${plural(a.days, 'day')}`;
    case 'FOLLOW_UP_TODAY':
      return 'Follow-up due today';
    case 'RESULT_NEEDED':
      return `Log result: ${a.round.title}`;
    case 'INTERVIEW_SOON':
      return `Interview: ${a.round.title} — ${interviewTime(a.round, zone)}`;
    case 'ACTION_REQUIRED':
      return 'Action required (no date set)';
  }
}
export function ApplicationRow({
  app,
  now,
  zone,
  today,
}: {
  app: RowApp;
  now: Date;
  zone: string;
  today: string;
}) {
  return (
    <li className="dsa-item">
      <Link className="link" href={`/jobs/${app.id}`}>
        {app.company}
      </Link>{' '}
      <span className="muted">· {app.role}</span>
      <p className="muted">
        <span className="pill">{label(app.stage)}</span>{' '}
        {nextLine(app, now, zone, today)}
      </p>
    </li>
  );
}
