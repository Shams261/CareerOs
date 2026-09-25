import Link from 'next/link';
import { formatDistance } from 'date-fns';
import { db, owner } from '@/server/db';
import { saveReminder } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { pushConfig } from '@/lib/env';
import { healthCheck } from '@/server/health';
import { activeDevices } from '@/features/push/service';
import { PushControls } from '@/features/push/controls';
import { signOutAction } from '@/features/auth/actions';
import { currentWeek } from '@/features/review/domain';
import { shiftDay } from '@/features/schedule/domain';

const ago = (d: Date | null | undefined, now: Date) =>
  d ? formatDistance(d, now, { addSuffix: true }) : 'never';

export default async function Settings() {
  const user = await owner();
  const now = new Date();
  const push = (() => {
    try {
      return pushConfig();
    } catch {
      return null;
    }
  })();
  const nextMonday = shiftDay(currentWeek(now, user.timezone), 7);
  const [pref, devices, health, calendar, jobs, routines, nextWeekPlans] =
    await Promise.all([
      db().notificationPreference.findUnique({
        where: { userId_type: { userId: user.id, type: 'DAILY_PROGRESS' } },
      }),
      activeDevices(user.id),
      healthCheck(),
      db().calendarConnection.findUnique({ where: { userId: user.id } }),
      db().jobRun.findMany(),
      db().routineBlock.count({ where: { userId: user.id, enabled: true } }),
      db().dailyPlan.count({
        where: {
          userId: user.id,
          generatedAt: { not: null },
          date: { gte: new Date(nextMonday) },
        },
      }),
    ]);
  const job = (name: string) => jobs.find((j) => j.name === name);
  const steps: [string, boolean, string][] = [
    ['Sign in', true, '/settings'],
    [`Confirm timezone (${user.timezone})`, true, '/settings'],
    ['Set up routines', routines > 0, '/calendar'],
    ['Enable notifications on a device', devices > 0, '#notifications-heading'],
    [
      'Connect Google Calendar',
      calendar?.status === 'CONNECTED',
      '/calendar#google-heading',
    ],
    ['Prepare next week', nextWeekPlans > 0, '/review'],
    ['Start using Today', true, '/today'],
  ];
  return (
    <>
      <p className="eyebrow">Make it yours</p>
      <h1>Workspace settings</h1>
      <section className="card mt-7" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <p>{user.email}</p>
        <p className="muted">
          Timezone: {user.timezone}. Dates and reminders use this zone.
        </p>
        <form action={signOutAction} className="mt-3">
          <Button className="secondary">Sign out</Button>
        </form>
      </section>

      <section className="card" aria-labelledby="start-heading">
        <h2 id="start-heading">Getting started</h2>
        <ol className="plain-list checklist">
          {steps.map(([label, done, href]) => (
            <li key={label}>
              <span aria-hidden="true">{done ? '✓' : '○'}</span>{' '}
              <span className="sr-only">{done ? 'Done:' : 'To do:'}</span>{' '}
              <Link className="link" href={href}>
                {label}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" aria-labelledby="notifications-heading">
        <h2 id="notifications-heading">Notifications</h2>
        {push ? (
          <PushControls publicKey={push.publicKey} />
        ) : (
          <p className="muted">
            Closed-app notifications are not configured on this server (VAPID
            keys missing). Reminders still appear in the Today inbox.
          </p>
        )}
        <p className="muted">
          Enabled on {devices} device{devices === 1 ? '' : 's'}. Reminders are
          always kept in the Today inbox; push is an extra delivery channel.
          Works in Chrome, Edge and Firefox on desktop and Android, and in
          Safari on macOS. On iPhone/iPad it requires iOS 16.4+ with CareerOS
          added to the Home Screen. Browsers and focus modes may delay or
          silence alerts.
        </p>
        <h3 className="mt-4">Daily progress reminder</h3>
        <form action={saveReminder}>
          <label className="check">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={pref?.enabled ?? true}
            />
            Remind me when I haven’t reviewed my day
          </label>
          <label>
            Local reminder time
            <input
              required
              type="time"
              name="preferredTime"
              defaultValue={pref?.preferredTime ?? '21:30'}
            />
          </label>
          <p className="muted mb-4">
            Timezone: {pref?.timezone ?? user.timezone}. Requires the deployment
            scheduler.
          </p>
          <Button>Save preference</Button>
        </form>
      </section>

      <section className="card" aria-labelledby="status-heading">
        <h2 id="status-heading">System status</h2>
        <dl className="job-facts">
          <div>
            <dt className="muted">Database</dt>
            <dd>{health.database === 'ok' ? 'Healthy' : 'Unreachable'}</dd>
          </div>
          <div>
            <dt className="muted">Session time zone</dt>
            <dd>
              {health.sessionTimeZone === 'UTC' ? 'UTC' : 'Needs attention'}
            </dd>
          </div>
          <div>
            <dt className="muted">Schema</dt>
            <dd>
              {health.schema === 'current' ? 'Current' : 'Migration pending'}
            </dd>
          </div>
          <div>
            <dt className="muted">Google Calendar</dt>
            <dd>
              {!calendar || calendar.status === 'DISCONNECTED'
                ? 'Not connected'
                : calendar.status === 'CONNECTED'
                  ? `Connected · synced ${ago(calendar.lastSuccessfulSyncAt, now)}`
                  : 'Attention required'}
            </dd>
          </div>
          <div>
            <dt className="muted">Notification job</dt>
            <dd>
              Last success {ago(job('notifications')?.lastSucceededAt, now)}
            </dd>
          </div>
          <div>
            <dt className="muted">Calendar sync job</dt>
            <dd>
              Last success {ago(job('calendar-sync')?.lastSucceededAt, now)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card" aria-labelledby="data-heading">
        <h2 id="data-heading">Your data</h2>
        <p className="muted">
          Download a JSON copy of your CareerOS records. It excludes Google
          credentials, device notification keys and sessions. Database backups
          remain the way to recover a full workspace.
        </p>
        <a className="button secondary" href="/api/export" download>
          Download data export
        </a>
      </section>
    </>
  );
}
