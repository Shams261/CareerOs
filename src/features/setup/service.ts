import 'server-only';
import { db } from '@/server/db';
import { memo } from '@/server/memo';
import { isTestNamed } from '@/lib/test-data';
import type { ScheduleUser } from '@/features/schedule/service';
import { setupSteps } from './domain';

/** The facts behind Make Silsila yours (WI-050): six small reads, memoized like snapshots. */
async function loadSetup(user: ScheduleUser) {
  const [goal, routines, nudges, calendar, devices, apps] = await Promise.all([
    db().goal.count({
      where: { userId: user.id, status: 'ACTIVE', targetDate: { not: null } },
    }),
    db().routineBlock.count({ where: { userId: user.id, enabled: true } }),
    db().studyNudgeSetting.count({ where: { userId: user.id } }),
    db().calendarConnection.findUnique({
      where: { userId: user.id },
      select: { status: true },
    }),
    db().pushSubscription.count({
      where: { userId: user.id, revokedAt: null },
    }),
    db().jobApplication.findMany({
      where: { userId: user.id },
      select: { company: true, role: true },
      take: 20,
    }),
  ]);
  return setupSteps({
    goalDate: goal > 0,
    routines,
    studyKinds: nudges > 0,
    calendar: calendar?.status ?? null,
    devices,
    applications: apps.filter((a) => !isTestNamed(a.company, a.role)).length,
  });
}
export const setupState = (user: ScheduleUser) =>
  memo(user.id, 'setup', () => loadSetup(user));
