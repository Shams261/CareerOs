'use client';
import { useRef, type ReactNode } from 'react';
import { ActionForm } from '@/components/action-form';
import { prepDoneAction } from './actions';

/**
 * A prep item as a checkbox (WI-017): ticking it submits at once, the row strikes through
 * immediately, and the box comes back if the server refuses.
 */
export function PrepCheck({
  id,
  completed,
  title,
  children,
}: {
  id: string;
  completed: boolean;
  title: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLInputElement>(null);
  return (
    <ActionForm
      action={prepDoneAction}
      className="prep-check"
      onSettled={(r) => {
        if (!r.ok && box.current) box.current.checked = completed;
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="completed" value={String(!completed)} />
      <label>
        <input
          ref={box}
          type="checkbox"
          defaultChecked={completed}
          aria-label={`Done: ${title}`}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        <span>{children}</span>
      </label>
    </ActionForm>
  );
}
