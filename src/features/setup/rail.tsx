import { cookies } from 'next/headers';
import type { ScheduleUser } from '@/features/schedule/service';
import { SetupCard } from './card';
import { SETUP_COOKIE, setupComplete, setupLine } from './domain';
import { setupState } from './service';

/** Today's rail opens with the setup steps until they are all done or hidden (WI-050). */
export async function SetupRail({ user }: { user: ScheduleUser }) {
  if ((await cookies()).get(SETUP_COOKIE)) return null;
  const steps = await setupState(user);
  if (setupComplete(steps)) return null;
  return <SetupCard steps={steps} line={setupLine(steps)} />;
}
