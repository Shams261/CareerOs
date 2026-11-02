import { cookies } from 'next/headers';
import type { ScheduleUser } from '@/server/lock';
import { SetupCard } from './card';
import { SETUP_COOKIE, setupLine, setupOnToday } from './domain';
import { setupState } from './service';

/**
 * The setup steps on Today (WI-050) while three or more are left (WI-141); fewer, and they live
 * in Settings only. Hide for now takes the card away for a week.
 */
export async function SetupRail({
  user,
  compact = false,
}: {
  user: ScheduleUser;
  /** The first-run Today shows one line until the owner opens it (WI-059). */
  compact?: boolean;
}) {
  if ((await cookies()).get(SETUP_COOKIE)) return null;
  const steps = await setupState(user);
  if (!setupOnToday(steps)) return null;
  return (
    <SetupCard steps={steps} line={setupLine(steps)} compact={compact} rail />
  );
}
