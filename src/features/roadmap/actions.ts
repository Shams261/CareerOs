'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { issueMessages } from '@/lib/validation';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import {
  addItems,
  applyItemOp,
  saveGoal,
  saveItem,
  saveRoadmap,
} from './service';

async function perform(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    revalidatePath('/roadmap', 'layout');
    revalidatePath('/today');
    revalidatePath('/review');
    return { ok: true, message };
  } catch (error) {
    return {
      message:
        error instanceof z.ZodError
          ? issueMessages(error.issues)
          : error instanceof Error && !('code' in error)
            ? error.message
            : 'Unable to save. Reload and try again.',
    };
  }
}
export async function goalAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await saveGoal(await owner(), Object.fromEntries(f));
    return f.get('id') ? 'Goal saved.' : 'Goal added.';
  });
}
export async function roadmapAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await saveRoadmap(await owner(), {
      ...Object.fromEntries(f),
      archived: f.get('archived') === 'on',
    });
    return f.get('id') ? 'Roadmap saved.' : 'Roadmap added.';
  });
}
export async function bulkItemsAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const n = await addItems(await owner(), Object.fromEntries(f));
    return `${n} item${n === 1 ? '' : 's'} added.`;
  });
}
export async function itemAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await saveItem(await owner(), Object.fromEntries(f));
    return 'Item saved.';
  });
}
export async function itemOpAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const op = await applyItemOp(await owner(), {
      id: f.get('id'),
      op: f.get('op'),
    });
    return op === 'remove'
      ? 'Removed.'
      : op === 'asked'
        ? 'Marked as asked in an interview.'
        : 'Saved.';
  });
}
