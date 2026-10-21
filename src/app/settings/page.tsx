import { savedTheme } from '@/server/theme';
import { saveTheme } from '@/features/theme-actions';
import Link from 'next/link';
import { formatDistance } from 'date-fns';
import { db, owner } from '@/server/db';
import { reminderAction } from '@/server/actions';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { pushConfig } from '@/lib/env';
import { healthCheck } from '@/server/health';
import { activeDevices } from '@/features/push/service';
import { PushControls } from '@/features/push/controls';
import { GoogleCalendarPanel } from '@/features/calendar/panel';
import { signOutAction } from '@/features/auth/actions';
import { currentWeek } from '@/features/review/domain';
import { shiftDay } from '@/features/schedule/domain';

const ago = (d: Date | null | undefined, now: Date) =>
  d ? formatDistance(d, now, { addSuffix: true }) : 'never';

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; reason?: string }>;
}) {
  const user = await owner();
  const theme = await savedTheme();
  const now = new Date();
  const flash = await searchParams;
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
  // The checklist disappears once everything on it is done.
  const steps: [string, boolean, string][] = [
    ['Add a routine', routines > 0, '/calendar'],
    ['Enable notifications on a device', devices > 0, '#notifications-heading'],
    [
      'Connect Google Calendar',
      calendar?.status === 'CONNECTED',
      '#google-heading',
    ],
    ['Prepare next week', nextWeekPlans > 0, '/review?step=plan'],
  ];
  const remaining = steps.filter(([, done]) => !done);
  return (
    <>
      <p className="eyebrow">Workspace · {user.timezone}</p>
      <h1>Settings</h1>
      {remaining.length > 0 && (
        <section className="card mt-7" aria-labelledby="start-heading">
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
      )}
      <section
        className={`card${remaining.length ? '' : ' mt-7'}`}
        aria-labelledby="notifications-heading"
      >
        <h2 id="notifications-heading">Notifications</h2>
        {push ? (
          <PushControls publicKey={push.publicKey} />
        ) : (
          <p className="muted">
            Push is not configured on this server. Reminders still appear on
            Today.
          </p>
        )}
        <p className="muted">
          Enabled on {devices} device{devices === 1 ? '' : 's'}. Reminders
          always stay on Today; push is an extra channel.
          {devices === 0
            ? ' On iPhone or iPad, add Silsila to the Home Screen first.'
            : ''}
        </p>
        <h3 className="mt-4">Daily reminder</h3>
        <ActionForm action={reminderAction} label="Daily reminder">
          <label className="check">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={pref?.enabled ?? true}
            />
            Remind me when I haven’t reviewed my day
          </label>
          <label>
            Time
            <input
              required
              type="time"
              name="preferredTime"
              defaultValue={pref?.preferredTime ?? '21:30'}
            />
          </label>
          <Button className="mt-3">Save</Button>
        </ActionForm>
      </section>

      <GoogleCalendarPanel user={user} flash={flash} />

      <section className="card" aria-labelledby="theme-heading">
        <h2 id="theme-heading">Appearance</h2>
        <form action={saveTheme} className="mt-3">
          <label htmlFor="theme">Theme</label>
          <select id="theme" name="theme" defaultValue={theme} key={theme}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <Button className="mt-3">Save</Button>
        </form>
      </section>

      <section className="card" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <p>{user.email}</p>
        <p className="muted">Timezone: {user.timezone}</p>
        <form action={signOutAction} className="mt-3">
          <Button className="secondary">Sign out</Button>
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
            <dt className="muted">Reminder job</dt>
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
          A JSON copy of your records, without credentials or device keys.
        </p>
        <a className="button secondary" href="/api/export" download>
          Download data export
        </a>
      </section>
    </>
  );
}
