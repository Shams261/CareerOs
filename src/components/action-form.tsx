'use client';
import {
  useActionState,
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Check } from 'lucide-react';
import type { ActionState } from '@/features/schedule/actions';

/** How long a success message stays beside the button before it clears. */
const SUCCESS_VISIBLE_MS = 3000;

export function ActionForm({
  action,
  children,
  className = '',
  label,
  resetOnSuccess = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  label?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, { message: '' });
  // The result whose success message has already faded out.
  const [faded, setFaded] = useState<ActionState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitter = useRef<HTMLElement | null>(null);
  // Clear inputs after a save while keeping the form mounted so its confirmation stays visible.
  // Hidden inputs keep the fresh values rendered by the revalidated page (for example requestId).
  useEffect(() => {
    if (resetOnSuccess && state.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);
  // Success clears itself after a moment; problems and previews stay until the next attempt.
  useEffect(() => {
    if (!state.message || !state.ok || state.preview) return;
    const timer = setTimeout(() => setFaded(state), SUCCESS_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [state]);
  const shown = state.message && faded !== state ? state : null;
  // The button that was pressed shows the pending state; the others only disable.
  useEffect(() => {
    const el = submitter.current;
    if (!el) return;
    if (pending) el.setAttribute('aria-busy', 'true');
    else {
      el.removeAttribute('aria-busy');
      submitter.current = null;
    }
  }, [pending]);
  return (
    <form
      ref={formRef}
      aria-label={label}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const button = (event.nativeEvent as SubmitEvent).submitter;
        submitter.current = button;
        const form = new FormData(event.currentTarget, button);
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
        <p className="sr-only" role="status">
          Saving…
        </p>
      )}
      {shown?.message && !pending && (
        <p
          className={shown.ok ? 'form-success' : 'form-message'}
          role={shown.ok ? 'status' : 'alert'}
        >
          {shown.ok && <Check size={14} aria-hidden="true" />}
          {shown.message}
        </p>
      )}
    </form>
  );
}
