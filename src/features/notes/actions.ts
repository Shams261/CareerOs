'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { issueMessages } from '@/lib/validation';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import { addNote, noteOp } from './service';

async function perform(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    revalidatePath('/', 'layout');
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
export async function addNoteAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await addNote(await owner(), { body: f.get('body') });
    return 'Saved to Today.';
  });
}
export async function noteOpAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const op = await noteOp(await owner(), {
      id: f.get('id'),
      op: f.get('op'),
    });
    return op === 'done' ? 'Done.' : 'Removed.';
  });
}
