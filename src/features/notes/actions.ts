'use server';
import { runAction } from '@/server/action';
import { owner } from '@/server/db';
import type { ActionState } from '@/lib/action-state';
import { addNote, noteOp } from './service';

type Done = string | { message: string; undo?: ActionState['undo'] };
const perform = (work: () => Promise<Done>) =>
  runAction(work, { area: 'notes' });
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
    // Done can be undone like Remove (WI-098): the note comes back to the list.
    return op === 'done'
      ? {
          message: 'Done.',
          undo: { kind: 'reopen-note', payload: { id: note.id } },
        }
      : {
          message: 'Removed.',
          undo: { kind: 'restore-note', payload: { body: note.body } },
        };
  });
}
