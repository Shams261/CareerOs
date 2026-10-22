'use client';
import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { disconnectAction } from './actions';

/**
 * Disconnect is plain; deleting the Google calendar is the destructive path and only
 * then asks for the calendar name (WI-016, review S-4).
 */
export function DisconnectForm({ calendarName }: { calendarName: string }) {
  const [remove, setRemove] = useState(false);
  return (
    <ActionForm
      action={disconnectAction}
      label="Disconnect Google Calendar"
      className="dsa-form"
    >
      <label className="check">
        <input
          type="checkbox"
          name="remove"
          checked={remove}
          onChange={(e) => setRemove(e.target.checked)}
        />
        Also delete the “{calendarName}” Google calendar (only that calendar;
        never your other calendars)
      </label>
      {remove && (
        <label>
          Type “{calendarName}” to confirm the delete
          <input name="confirm" autoComplete="off" required />
        </label>
      )}
      <Button variant={remove ? 'destructive' : 'secondary'}>
        {remove ? 'Disconnect and delete the calendar' : 'Disconnect'}
      </Button>
    </ActionForm>
  );
}
