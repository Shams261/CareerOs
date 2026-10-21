'use server';
import { forgetAll } from '@/server/memo';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { issueMessages } from '@/lib/validation';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import { addNote, noteOp } from './service';

type Done = string | { message: string; undo?: ActionState['undo'] };
async function perform(work: () => Promise<Done>): Promise<ActionState> {
  try {
    const done = await work();
    forgetAll();
    revalidatePath('/', 'layout');
    return typeof done === 'string'
      ? { ok: true, message: done }
      : { ok: true, message: done.message, undo: done.undo };
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
    const { op, note } = await noteOp(await owner(), {
      id: f.get('id'),
      op: f.get('op'),
    });
    return op === 'done'
      ? 'Done.'
      : {
          message: 'Removed.',
          undo: { kind: 'restore-note', payload: { body: note.body } },
        };
  });
}
