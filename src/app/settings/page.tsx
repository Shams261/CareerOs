import { savedTheme } from '@/server/theme';
import Link from 'next/link';
import { formatDistance } from 'date-fns';
import {
  Bell,
  Check,
  Circle,
  Download,
  ImageIcon,
  Keyboard,
  MessageCircle,
  MessagesSquare,
  Server,
  Sun,
  UserRound,
} from 'lucide-react';
import { db, owner } from '@/server/db';
import { reminderAction } from '@/server/actions';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { SidePanel } from '@/components/side-panel';
import { pushConfig } from '@/lib/env';
import { healthCheck } from '@/server/health';
import { activeDevices } from '@/features/push/service';
import { PushControls } from '@/features/push/controls';
import { GoogleCalendarPanel } from '@/features/calendar/panel';
import { LearningReminderForm } from '@/features/learning/forms';
import { JobReminderForm } from '@/features/jobs/forms';
import { ShortcutsToggle } from '@/components/shortcuts-toggle';
import { UtilityMenu } from '@/features/today/utility-menu';
import { signOutAction } from '@/features/auth/actions';
import { currentWeek } from '@/features/review/domain';
import { shiftDay } from '@/features/schedule/domain';
import { SettingsIndex } from '@/features/settings/index-nav';
import { SettingRow } from '@/features/settings/rows';
import { NudgeSettingsForm } from '@/features/nudges/forms';
import { nudgeContext } from '@/features/nudges/domain';
import { nudgeSetting } from '@/features/nudges/service';
import { dayKey } from '@/lib/time';
import { aiState } from '@/features/ai/service';
import { dayPrintAction } from '@/features/day-print/actions';
import { AiSettings, aiContext } from '@/features/ai/settings';
import { memories } from '@/features/agent/service';
import { MemorySettings, memoryContext } from '@/features/agent/memory';
import { AGENT_NAME } from '@/features/agent/domain';
import { ThemeSwitch } from '@/features/settings/theme-switch';
import { reminderContext, settingsSummary } from '@/features/settings/domain';
export const metadata = { title: 'Settings' };

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
  const [
    prefs,
    devices,
    health,
    calendar,
    jobs,
    routines,
    nextWeekPlans,
    nudgeRow,
    routineCategories,
    ai,
    memoryLines,
  ] = await Promise.all([
    db().notificationPreference.findMany({
      where: {
        userId: user.id,
        type: {
          in: [
            'DAILY_PROGRESS',
            'TECHNICAL_REVIEW',
            'JOB_FOLLOW_UP',
            'INTERVIEW',
          ],
        },
      },
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
    db().studyNudgeSetting.findUnique({ where: { userId: user.id } }),
    db().routineBlock.findMany({
      where: { userId: user.id },
      select: { category: true },
      distinct: ['category'],
    }),
    aiState(user, now),
    memories(user),
  ]);
  const nudges = nudgeSetting(nudgeRow);
  const today = dayKey(now, user.timezone);
  const nudgesPaused = !!nudges.pausedUntil && nudges.pausedUntil >= today;
  const prefOf = (type: string) => prefs.find((p) => p.type === type) ?? null;
  const pref = prefOf('DAILY_PROGRESS'),
    revisionPref = prefOf('TECHNICAL_REVIEW'),
    followUpPref = prefOf('JOB_FOLLOW_UP'),
    interviewPref = prefOf('INTERVIEW');
  const job = (name: string) => jobs.find((j) => j.name === name);
  // The checklist disappears once everything on it is done.
  const steps: [string, boolean, string][] = [
    ['Add a routine', routines > 0, '/calendar'],
    ['Enable notifications on a device', devices > 0, '#reminders'],
    ['Connect Google Calendar', calendar?.status === 'CONNECTED', '#calendar'],
    ['Prepare next week', nextWeekPlans > 0, '/review?step=plan'],
  ];
  const remaining = steps.filter(([, done]) => !done);
  const groups = [
    { id: 'reminders', label: 'Reminders' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'account', label: 'Account' },
    { id: 'data', label: 'Data' },
  ];
  const healthy =
    health.database === 'ok' &&
    health.sessionTimeZone === 'UTC' &&
    health.schema === 'current';
  const statusLine = [
    `Database ${health.database === 'ok' ? 'ok' : 'unreachable'}`,
    health.sessionTimeZone === 'UTC'
      ? 'UTC'
      : 'session time zone needs attention',
    health.schema === 'current' ? 'schema current' : 'migration pending',
    `reminder job ${ago(job('notifications')?.lastSucceededAt, now)}`,
    `calendar sync ${ago(job('calendar-sync')?.lastSucceededAt, now)}`,
  ].join(' · ');
  return (
    <>
      <header className="today-head">
        <div className="today-head-row">
          <div className="today-title">
            <h1>Settings</h1>
          </div>
          <UtilityMenu>
            <a className="link-button today-util" href="/api/export" download>
              Download my data
            </a>
            <form action={signOutAction}>
              <Button className="secondary">Sign out</Button>
            </form>
          </UtilityMenu>
        </div>
        <p className="today-summary">
          {settingsSummary({
            email: user.email,
            timezone: user.timezone,
            theme,
            devices,
            calendar: calendar
              ? {
                  status: calendar.status,
                  lastSync: calendar.lastSuccessfulSyncAt,
                }
              : null,
            now,
          })}
        </p>
      </header>
      <div className="settings-layout">
        <SettingsIndex sections={groups} />
        <div className="settings-main">
          {remaining.length > 0 && (
            <section className="card" aria-labelledby="start-heading">
              <h2 id="start-heading">Getting started</h2>
              <ol className="plain-list checklist">
                {steps.map(([label, done, href]) => (
                  <li key={label}>
                    {done ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Circle size={14} aria-hidden="true" />
                    )}{' '}
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
            id="reminders"
            className="settings-group"
            aria-labelledby="notifications-heading"
          >
            <div className="agenda-head">
              <h2 id="notifications-heading" className="agenda-heading">
                Reminders
              </h2>
              <span className="muted">
                {devices
                  ? `${devices} device${devices === 1 ? '' : 's'} enabled`
                  : 'No device enabled yet'}
              </span>
            </div>
            <div className="settings-device">
              {push ? (
                <PushControls publicKey={push.publicKey} devices={devices} />
              ) : (
                <p className="status-line">
                  <span>
                    Push is not configured on this server; reminders stay on
                    Today.
                  </span>
                </p>
              )}
            </div>
            <ul className="plain-list attention-list">
              <SettingRow
                source="notification"
                icon={<Bell size={22} />}
                label="Study nudges"
                title="A morning plan, a block-start nudge and an evening check-in"
                context={`${nudgeContext(nudges)}${nudgesPaused ? ' · Paused' : ''}`}
                panel="reminder-study"
              />
              <SettingRow
                source="notification"
                icon={<Bell size={22} />}
                label="Daily"
                title="Remind me when I haven’t reviewed my day"
                context={reminderContext(pref, { time: '21:30' })}
                panel="reminder-daily"
              />
              <SettingRow
                source="notification"
                icon={<Bell size={22} />}
                label="Revision"
                title="Roadmap items and topics due for revision"
                context={reminderContext(revisionPref, { time: '18:00' })}
                panel="reminder-revision"
              />
              <SettingRow
                source="notification"
                icon={<Bell size={22} />}
                label="Job follow-up"
                title="Follow-ups on their planned date"
                context={reminderContext(followUpPref, { time: '09:00' })}
                panel="reminder-jobs"
                focus="follow-up"
              />
              <SettingRow
                source="notification"
                icon={<Bell size={22} />}
                label="Interview"
                title="About 24 hours before, and shortly before"
                context={reminderContext(interviewPref, { offset: 60 })}
                panel="reminder-jobs"
                focus="interview"
              />
            </ul>
            <SidePanel id="reminder-study" title="Study nudges">
              <p className="status-line">
                <span>
                  Off by default · a morning line and an evening check-in, four
                  hours apart, plus one block-start nudge a day · never during a
                  focus session · the lock screen never names a task
                </span>
              </p>
              <NudgeSettingsForm
                setting={nudges}
                categories={routineCategories.map((r) => r.category)}
                today={today}
              />
              <div className="panel-section">
                <h3>This device</h3>
                {push ? (
                  <PushControls publicKey={push.publicKey} devices={devices} />
                ) : (
                  <p className="muted">
                    Push is not configured on this server. Nudges appear on
                    Today.
                  </p>
                )}
                <p className="status-line">
                  <span>
                    Without notifications, nudges stay on Today · iPhone needs
                    Silsila on the Home Screen (iOS 16.4+)
                  </span>
                </p>
              </div>
            </SidePanel>
            <SidePanel id="reminder-daily" title="Daily reminder">
              <ActionForm
                action={reminderAction}
                label="Daily reminder"
                className="dsa-form"
                closeOnSuccess
              >
                <label className="check">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={pref?.enabled ?? false}
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
                <Button>Save</Button>
              </ActionForm>
            </SidePanel>
            <SidePanel id="reminder-revision" title="Revision reminder">
              <LearningReminderForm pref={revisionPref} />
            </SidePanel>
            <SidePanel id="reminder-jobs" title="Job reminders">
              <JobReminderForm
                followUp={followUpPref}
                interview={interviewPref}
              />
            </SidePanel>
          </section>

          <section
            id="calendar"
            className="settings-group"
            aria-labelledby="google-heading"
          >
            <GoogleCalendarPanel user={user} flash={flash} />
          </section>

          <section
            id="appearance"
            className="settings-group"
            aria-labelledby="theme-heading"
          >
            <div className="agenda-head">
              <h2 id="theme-heading" className="agenda-heading">
                Appearance
              </h2>
            </div>
            <ul className="plain-list attention-list">
              <SettingRow
                source="practice"
                icon={<Sun size={22} />}
                label="Theme"
                title={theme === 'dark' ? 'Dark' : 'Light'}
                context="Light is the default; Dark is saved for this browser"
                control={<ThemeSwitch theme={theme} />}
              />
              <SettingRow
                source="practice"
                icon={<Keyboard size={22} />}
                label="Keyboard shortcuts"
                title="Single-key shortcuts on this device"
                context="N, S, J, K, D, C; ? always lists them"
                control={<ShortcutsToggle label="On" className="check" />}
              />
              <SettingRow
                source="weekly"
                icon={<ImageIcon size={22} />}
                label="Day print"
                title="A print of each closed day"
                context={
                  user.dayPrint === false
                    ? 'Off'
                    : user.dayPrint
                      ? 'On'
                      : 'On · you have not chosen yet'
                }
                control={
                  <ActionForm action={dayPrintAction} label="Day print">
                    <Button
                      className="secondary small"
                      name="choice"
                      value={user.dayPrint === false ? 'on' : 'off'}
                    >
                      {user.dayPrint === false ? 'Turn on' : 'Turn off'}
                    </Button>
                  </ActionForm>
                }
              />
            </ul>
          </section>

          <section
            id="account"
            className="settings-group"
            aria-labelledby="account-heading"
          >
            <div className="agenda-head">
              <h2 id="account-heading" className="agenda-heading">
                Account
              </h2>
            </div>
            <ul className="plain-list attention-list">
              <SettingRow
                source="job"
                icon={<UserRound size={22} />}
                label="Owner"
                title={user.email}
                context={`${user.timezone} · signed in with Google`}
              />
            </ul>
          </section>

          <section
            id="data"
            className="settings-group"
            aria-labelledby="data-heading"
          >
            <div className="agenda-head">
              <h2 id="data-heading" className="agenda-heading">
                Data
              </h2>
            </div>
            <ul className="plain-list attention-list">
              <SettingRow
                source="roadmap"
                icon={<MessagesSquare size={22} />}
                label="AI"
                title="Grill Me"
                context={aiContext(ai)}
                panel="ai"
              />
              {ai.configured && (
                <SettingRow
                  source="roadmap"
                  icon={<MessageCircle size={22} />}
                  label={AGENT_NAME}
                  title={`${AGENT_NAME} knows`}
                  context={memoryContext(memoryLines.length)}
                  panel="rumi-memory"
                />
              )}
              <SettingRow
                source="weekly"
                icon={<Download size={22} />}
                label="Export"
                title="Download my data"
                context="JSON · without credentials or device keys"
                href="/api/export"
                download
              />
              <SettingRow
                source="weekly"
                icon={<Server size={22} />}
                label="System"
                title={healthy ? 'All healthy' : 'Needs attention'}
                context={statusLine}
              />
            </ul>
            <SidePanel id="ai" title="Grill Me">
              <AiSettings state={ai} zone={user.timezone} />
            </SidePanel>
            <SidePanel id="rumi-memory" title={`${AGENT_NAME} knows`}>
              <MemorySettings lines={memoryLines} />
            </SidePanel>
          </section>
        </div>
      </div>
    </>
  );
}
