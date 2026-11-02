import 'server-only';
import { cookies } from 'next/headers';
import { formatDistance } from 'date-fns';
import { db, type owner } from '@/server/db';
import { savedRumiButton, savedTextSize, savedTheme } from '@/server/theme';
import { activeSessions, currentSession } from '@/server/session';
import { healthCheck } from '@/server/health';
import { pushConfig } from '@/lib/env';
import { dayKey } from '@/lib/time';
import { setupState } from '@/features/setup/service';
import { SETUP_COOKIE } from '@/features/setup/domain';
import { curriculumSummary } from '@/features/curriculum/service';
import { activeDevices } from '@/features/push/service';
import { nudgeSetting } from '@/features/nudges/service';
import { aiState } from '@/features/ai/service';
import { memories } from '@/features/agent/service';
import { agentSetting, rumiStyle } from '@/features/agent/memory-service';
import { lineStats } from '@/features/agent/lines';
import { lastSentText } from './domain';

export type SettingsOwner = Awaited<ReturnType<typeof owner>>;
const ago = (d: Date | null | undefined, now: Date) =>
  d ? formatDistance(d, now, { addSuffix: true }) : 'never';

/** Everything Settings shows, read in one place (WI-127). */
export async function settingsPage(
  user: SettingsOwner,
  flash: { google?: string; reason?: string },
  now: Date,
) {
  const [theme, size, rumiButton] = await Promise.all([
    savedTheme(),
    savedTextSize(),
    savedRumiButton(),
  ]);
  const push = (() => {
    try {
      return pushConfig();
    } catch {
      return null;
    }
  })();
  const [
    prefs,
    devices,
    health,
    calendar,
    jobs,
    setup,
    nudgeRow,
    routineCategories,
    ai,
    memoryLines,
    agent,
    style,
    sessions,
    sentRows,
    curriculum,
    lines,
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
    setupState(user),
    db().studyNudgeSetting.findUnique({ where: { userId: user.id } }),
    db().routineBlock.findMany({
      where: { userId: user.id },
      select: { category: true },
      distinct: ['category'],
    }),
    aiState(user, now),
    memories(user),
    agentSetting(user),
    rumiStyle(user),
    // Signed-in devices (WI-057); this request's session is marked.
    currentSession().then((c) => activeSessions(user.id, c?.id ?? null, now)),
    // When each kind of reminder last came out, so the owner can see it really goes (WI-060).
    db().notificationLog.groupBy({
      by: ['type'],
      where: { userId: user.id, scheduledFor: { lte: new Date() } },
      _max: { scheduledFor: true },
    }),
    curriculumSummary(),
    lineStats(user, now),
  ]);
  const nudges = nudgeSetting(nudgeRow);
  const today = dayKey(now, user.timezone);
  const prefOf = (type: string) => prefs.find((p) => p.type === type) ?? null;
  const job = (name: string) => jobs.find((j) => j.name === name);
  // Make Silsila yours (WI-050), the same steps as Today's; it disappears once all are done.
  // Today shows it; Settings repeats it only while Today's card is hidden for now (WI-058).
  const hiddenOnToday = !!(await cookies()).get(SETUP_COOKIE);
  return {
    user,
    now,
    flash,
    today,
    theme,
    size,
    rumiButton,
    push,
    devices,
    calendar,
    routineCategories,
    ai,
    memoryLines,
    agent,
    style,
    sessions,
    curriculum,
    lines,
    nudges,
    nudgesPaused: !!nudges.pausedUntil && nudges.pausedUntil >= today,
    pref: prefOf('DAILY_PROGRESS'),
    revisionPref: prefOf('TECHNICAL_REVIEW'),
    followUpPref: prefOf('JOB_FOLLOW_UP'),
    interviewPref: prefOf('INTERVIEW'),
    steps: setup,
    remaining: hiddenOnToday ? setup.filter((s) => !s.done) : [],
    healthy:
      health.database === 'ok' &&
      health.sessionTimeZone === 'UTC' &&
      health.schema === 'current',
    statusLine: [
      `Database ${health.database === 'ok' ? 'ok' : 'unreachable'}`,
      health.sessionTimeZone === 'UTC'
        ? 'UTC'
        : 'session time zone needs attention',
      health.schema === 'current' ? 'schema current' : 'migration pending',
      `reminder job ${ago(job('notifications')?.lastSucceededAt, now)}`,
      `calendar sync ${ago(job('calendar-sync')?.lastSucceededAt, now)}`,
    ].join(' · '),
    sent: (types: string[]) =>
      lastSentText(
        sentRows
          .filter((r) => types.includes(r.type))
          .map((r) => r._max.scheduledFor),
        user.timezone,
      ),
  };
}
export type SettingsView = Awaited<ReturnType<typeof settingsPage>>;
