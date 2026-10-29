'use client';
import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/features/schedule/actions';

/**
 * Delete with one confirmation (WI-060): the first press asks in place, naming what goes;
 * Delete then runs the action, Keep backs out. Used where Undo cannot bring everything back.
 */
export function ConfirmDelete({
  action,
  id,
  label,
  question,
  broadcast,
  closeOnSuccess = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  id: string;
  /** "Delete application", "Hide problem". */
  label: string;
  /** "Delete Northwind Labs, its 2 interviews and its history?" */
  question: string;
  broadcast?: string;
  /** Close the surrounding panel after the delete, so the Undo outside it is in view. */
  closeOnSuccess?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button
        type="button"
        className="button destructive small"
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  return (
    <ActionForm
      action={action}
      label={label}
      broadcast={broadcast}
      closeOnSuccess={closeOnSuccess}
      className="confirm-delete"
      onSuccess={() => setAsking(false)}
    >
      <input type="hidden" name="id" value={id} />
      <p className="confirm-delete-question">{question}</p>
      <div className="actions">
        <Button variant="destructive" className="small">
          {label}
        </Button>
        <button
          type="button"
          className="button secondary small"
          onClick={() => setAsking(false)}
        >
          Keep
        </button>
      </div>
    </ActionForm>
  );
}
