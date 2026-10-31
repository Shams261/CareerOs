'use client';
import { useState } from 'react';
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

/** Notes waiting on Today. Done and Remove hide the row at once; a refusal brings it back. */
export function NoteList({ notes }: { notes: QuickNote[] }) {
  // The hidden rows belong to this list; a fresh list from the server (after Undo brings a
  // note back, WI-098) starts with none hidden.
  const [hidden, setHidden] = useState<{
    notes: QuickNote[];
    ids: ReadonlySet<string>;
  }>({ notes, ids: new Set() });
  const gone = hidden.notes === notes ? hidden.ids : new Set<string>();
  const hide = (id: string, on: boolean) =>
    setHidden((s) => {
      const next = new Set(s.notes === notes ? s.ids : []);
      if (on) next.add(id);
      else next.delete(id);
      return { notes, ids: next };
    });
  return (
    <ul className="plain-list">
      {notes.map((n) => (
        <li
          className={`note-row${gone.has(n.id) ? ' is-gone' : ''}`}
          key={n.id}
        >
          <p className="learning-notes">{n.body}</p>
          <ActionForm
            action={noteOpAction}
            broadcast="notes"
            onPending={() => hide(n.id, true)}
            onSettled={(r) => {
              if (!r.ok) hide(n.id, false);
            }}
          >
            <input type="hidden" name="id" value={n.id} />
            <div className="actions">
              <button
                className="button secondary"
                name="op"
                value="done"
                aria-label={`Done: ${n.body.slice(0, 60)}`}
              >
                Done
              </button>
              <button
                className="button secondary"
                name="op"
                value="remove"
                aria-label={`Remove note: ${n.body.slice(0, 60)}`}
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
