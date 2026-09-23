'use client';
import { useActionState, startTransition } from 'react';
import type { ActionState } from '@/features/schedule/actions';
export function ActionForm({
  action,
  children,
  className = '',
  label,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, { message: '' });
  return (
    <form
      aria-label={label}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const form = new FormData(event.currentTarget, submitter);
        startTransition(() => dispatch(form));
      }}
    >
      <fieldset disabled={pending} className="min-w-0">
        <input type="hidden" name="token" value={state.token ?? ''} />
        {children}
        {state.preview && (
          <div className="preview">
            <strong>Review affected blocks</strong>
            <ul>
              {state.preview.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <button className="button mt-3" type="submit">
              Confirm these changes
            </button>
          </div>
        )}
      </fieldset>
      {pending && (
        <p className="muted" role="status">
          Saving…
        </p>
      )}
      {state.message && (
        <p
          className={state.ok ? 'form-success' : 'form-message'}
          role={state.ok ? 'status' : 'alert'}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
