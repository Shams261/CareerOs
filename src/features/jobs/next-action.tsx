'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { followUpDoneAction } from './actions';

/**
 * The application's next action as one highlighted strip with a one-click Mark done
 * (WI-017). The strip flips to done as soon as the button is pressed and comes back if
 * the server refuses; a note or a follow-up action goes through the forms below it.
 */
export function NextActionBox({
  id,
  requestId,
  title,
  due,
  mine,
  ownerText,
  closed,
}: {
  id: string;
  /** Minted on the server so the hidden field matches between render and hydration. */
  requestId: string;
  title: string;
  due: string;
  mine: boolean;
  ownerText: string;
  closed: boolean;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className={`next-action${done ? ' is-done' : ''}`}>
      <div className="next-action-main">
        <strong>{title}</strong>
        <small>
          <span className={`pill ${mine ? 'warning' : ''}`}>{ownerText}</span> ·{' '}
          {done ? 'done' : due}
        </small>
      </div>
      {!closed && (
        <ActionForm
          action={followUpDoneAction}
          broadcast="next-action"
          onPending={() => setDone(true)}
          onSettled={(r) => {
            if (!r.ok) setDone(false);
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="actionOwner" value="ME" />
          <Button variant="secondary" aria-label={`Mark done: ${title}`}>
            <Check size={14} aria-hidden="true" /> {done ? 'Done' : 'Mark done'}
          </Button>
        </ActionForm>
      )}
    </div>
  );
}
