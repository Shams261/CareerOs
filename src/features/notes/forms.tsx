import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import type { QuickNote } from '@/generated/prisma/client';
import { addNoteAction, noteOpAction } from './actions';

/** One field in the shell: a thought you do not want to lose lands on Today. */
export function CaptureForm() {
  return (
    <ActionForm
      action={addNoteAction}
      label="Note to self"
      className="capture"
      resetOnSuccess
    >
      <input
        name="body"
        maxLength={500}
        required
        placeholder="Note to self…"
        aria-label="Note to self"
        autoComplete="off"
      />
      <Button className="secondary">Save</Button>
    </ActionForm>
  );
}

export function NoteList({ notes }: { notes: QuickNote[] }) {
  return (
    <ul className="plain-list">
      {notes.map((n) => (
        <li className="note-row" key={n.id}>
          <p className="learning-notes">{n.body}</p>
          <ActionForm action={noteOpAction} label={`Actions for note`}>
            <input type="hidden" name="id" value={n.id} />
            <div className="actions">
              <button className="button secondary" name="op" value="done">
                Done
              </button>
              <button
                className="button secondary"
                name="op"
                value="remove"
                aria-label="Remove note"
              >
                Remove
              </button>
            </div>
          </ActionForm>
        </li>
      ))}
    </ul>
  );
}
