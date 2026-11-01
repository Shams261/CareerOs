import 'server-only';
import { revalidatePath } from 'next/cache';
import { forgetAll } from '@/server/memo';
import { syncSoon } from '@/features/calendar/background';
import type { ScheduleUser } from '@/features/schedule/service';
import type { WriteAction } from './write-domain';

/**
 * After an answer that changed something (WI-102): the snapshots go, a new block reaches the
 * calendar, and the pages that show notes, blocks and rest days read again.
 */
export function afterWrites(user: ScheduleUser, actions: WriteAction[]) {
  if (!actions.length) return;
  forgetAll();
  if (actions.some((a) => a.tool === 'add_block')) syncSoon(user);
  for (const path of ['/today', '/calendar']) revalidatePath(path);
}
