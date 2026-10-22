'use client';
import {
  useActionState,
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ActionState } from '@/features/schedule/actions';
import { undoAction } from '@/features/undo/actions';
import { publishFeedback } from './feedback-channel';
import { Button } from '@/components/ui/button';

/** How long a success message stays beside the button before it clears. */
export const SUCCESS_VISIBLE_MS = 3000;
/** A message that offers Undo stays longer, so the way back is never a race. */
export const UNDO_VISIBLE_MS = 8000;

export function ActionForm({
  action,
  children,
  className = '',
  label,
  resetOnSuccess = false,
  broadcast,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  label?: string;
  resetOnSuccess?: boolean;
  /**
   * A `FeedbackOutlet` channel. The success message (and Undo) is shown there instead of
   * inside this form, so it survives when the row holding the form disappears.
   */
  broadcast?: string;
}) {
  const [state, dispatch, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const result = await action(previous, form);
      // Published before React commits the refreshed page, which may unmount this form.
      if (broadcast && result.ok && result.message && !result.preview)
        publishFeedback(broadcast, result);
      return result;
    },
    { message: '' },
  );
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
    const timer = setTimeout(
      () => setFaded(state),
      state.undo ? UNDO_VISIBLE_MS : SUCCESS_VISIBLE_MS,
    );
    return () => clearTimeout(timer);
  }, [state]);
  const shown =
    state.message && faded !== state && !(broadcast && state.ok) ? state : null;
  // The button that was pressed shows the pending state; the others only disable.
  useEffect(() => {
    const el = submitter.current;
    if (!el) return;
    if (pending) el.setAttribute('aria-busy', 'true');
    else {
      el.removeAttribute('aria-busy');
      // The disabled fieldset dropped focus to the body; put it back where it was.
      if (el.isConnected && document.activeElement === document.body)
        el.focus();
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
            <Button className="mt-3" type="submit">
              Confirm these changes
            </Button>
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
          {shown.ok && shown.undo && (
            <UndoButton undo={shown.undo} onDone={() => setFaded(shown)} />
          )}
        </p>
      )}
    </form>
  );
}

/** Reverses the action that produced the message; the page refreshes with the restored record. */
export function UndoButton({
  undo,
  onDone,
}: {
  undo: NonNullable<ActionState['undo']>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  if (result) return <span className="undo-result">{result}</span>;
  return (
    <button
      type="button"
      className="undo-link"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await undoAction(undo.kind, undo.payload);
        setBusy(false);
        setResult(r.message);
        if (r.ok) {
          router.refresh();
          setTimeout(onDone, SUCCESS_VISIBLE_MS);
        }
      }}
    >
      {busy ? 'Undoing…' : (undo.label ?? 'Undo')}
    </button>
  );
}
