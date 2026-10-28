'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import { syncSoon } from '@/features/calendar/background';
import type { ActionState } from '@/features/schedule/actions';
import {
  deleteApplication,
  deleteBlock,
  deleteGoal,
  deletePrepItem,
  deleteRoadmap,
  deleteRound,
  deleteSession,
  removeProblem,
  unhideProblem,
} from './service';

const id = (f: FormData) => z.string().min(1).parse(f.get('id'));
const refresh = (paths: string[]) => {
  forgetAll();
  for (const p of paths) revalidatePath(p, 'layout');
};
const failed = (error: unknown): ActionState => {
  // Names and codes only, never record content (docs/engineering/security.md).
  console.error(
    '[deletes] failed',
    error instanceof Error ? error.name : 'Error',
    error && typeof error === 'object' && 'code' in error ? error.code : '',
  );
  return {
    message:
      error instanceof Error &&
      !(error instanceof z.ZodError) &&
      !('code' in error)
        ? error.message
        : 'Could not delete it. Reload and try again.',
  };
};

/** Delete a block added for one day (WI-060), with Undo. */
export async function deleteBlockAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    const blockId = id(f);
    const title = await deleteBlock(user, blockId);
    refresh(['/today', '/calendar']);
    syncSoon(user);
    return {
      ok: true,
      message: `Deleted ${title}.`,
      undo: { kind: 'block-reset', payload: { id: blockId } },
    };
  } catch (error) {
    return failed(error);
  }
}

export async function deleteApplicationAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    await deleteApplication(user, id(f));
    refresh(['/jobs', '/today', '/calendar']);
    syncSoon(user);
  } catch (error) {
    return failed(error);
  }
  redirect('/jobs');
}

export async function deleteRoundAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    const round = await deleteRound(user, id(f));
    refresh(['/jobs', '/today', '/calendar']);
    syncSoon(user);
    return { ok: true, message: `Deleted the ${round.title} interview.` };
  } catch (error) {
    return failed(error);
  }
}

export async function deletePrepItemAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    const item = await deletePrepItem(user, id(f));
    refresh(['/jobs', '/today']);
    return {
      ok: true,
      message: `Deleted ${item.title}.`,
      undo: {
        kind: 'restore-prep-item',
        payload: {
          roundId: item.roundId,
          kind: item.kind,
          title: item.title,
          notes: item.notes,
          completed: item.completed,
          learningTopicId: item.learningTopicId,
          dsaProblemId: item.dsaProblemId,
          dsaTopicId: item.dsaTopicId,
        },
      },
    };
  } catch (error) {
    return failed(error);
  }
}

/** Delete a problem the owner added, or hide one from the imported curriculum (WI-060). */
export async function removeProblemAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let hidden = false;
  try {
    const user = await owner();
    ({ hidden } = await removeProblem(user, id(f)));
    refresh(['/dsa', '/roadmap', '/today']);
  } catch (error) {
    return failed(error);
  }
  if (!hidden) redirect('/dsa');
  return {
    ok: true,
    message: 'Hidden from Practice. Show it again here any time.',
  };
}

export async function unhideProblemAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    await unhideProblem(user, id(f));
    refresh(['/dsa', '/roadmap', '/today']);
    return { ok: true, message: 'Back in Practice.' };
  } catch (error) {
    return failed(error);
  }
}

export async function deleteGoalAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    const title = await deleteGoal(user, id(f));
    refresh(['/roadmap', '/today', '/review']);
    return { ok: true, message: `Deleted the goal ${title}.` };
  } catch (error) {
    return failed(error);
  }
}

export async function deleteRoadmapAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    await deleteRoadmap(user, id(f));
    refresh(['/roadmap', '/today', '/dsa']);
  } catch (error) {
    return failed(error);
  }
  redirect('/roadmap');
}

export async function deleteSessionAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const user = await owner();
    const s = await deleteSession(user, id(f));
    refresh(['/today', '/calendar', '/review']);
    return {
      ok: true,
      message: 'Session deleted.',
      undo: {
        kind: 'restore-session',
        payload: {
          taskId: s.taskId,
          goalId: s.goalId,
          category: s.category,
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt!.toISOString(),
          notes: s.notes,
        },
      },
    };
  } catch (error) {
    return failed(error);
  }
}
