'use client';
import {
  useActionState,
  startTransition,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ActionState } from '@/features/schedule/actions';
import { undoAction } from '@/features/undo/actions';
import { publishFeedback } from './feedback-channel';
import { Button } from '@/components/ui/button';
import { useDisclosure } from './disclosure';
import { startProgress, stopProgress } from './progress-bar-top';
import {
  applyDraft,
  clearDraft,
  hasDraft,
  readDraft,
  serializeForm,
  subscribeDrafts,
  writeDraft,
} from './drafts';

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
  closeOnSuccess = false,
  onSuccess,
  onPending,
  onSettled,
  draft,
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
  /** Close the surrounding Disclosure after a successful save (pair with `broadcast`). */
  closeOnSuccess?: boolean;
  /** Called after a successful save, for client state the DOM reset cannot touch. */
  onSuccess?: () => void;
  /** Called with the submitted data before the action runs: flip the row optimistically. */
  onPending?: (form: FormData) => void;
  /** Called with the result: reconcile an optimistic flip (revert when `ok` is false). */
  onSettled?: (result: ActionState) => void;
  /**
   * Keep what is typed in this browser tab under this key until it is saved or discarded,
   * so Back, a refresh or a closed panel never loses it (WI-018).
   */
  draft?: string;
}) {
  const disclosure = useDisclosure();
  const [state, dispatch, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const result = await action(previous, form);
      // Published before React commits the refreshed page, which may unmount this form.
      if (broadcast && result.ok && result.message && !result.preview)
        publishFeedback(broadcast, result);
      if (result.ok && !result.preview) {
        if (draft) clearDraft(draft);
        onSuccess?.();
        if (closeOnSuccess) disclosure?.close();
      }
      onSettled?.(result);
      return result;
    },
    { message: '' },
  );
  // The first field the browser refused: shown as an inline message instead of its bubble.
  const [invalid, setInvalid] = useState<string | null>(null);
  const burst = useRef(false);
  // The result whose success message has already faded out.
  const [faded, setFaded] = useState<ActionState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitter = useRef<HTMLElement | null>(null);
  // A kept draft lands in the fields once, after hydration; the line below says so.
  const kept = useSyncExternalStore(
    subscribeDrafts,
    () => (draft ? hasDraft(draft) : false),
    () => false,
  );
  useEffect(() => {
    if (!draft || !formRef.current) return;
    const data = readDraft(draft);
    if (data) applyDraft(formRef.current, data);
  }, [draft]);
  const keep = (form: HTMLFormElement) => {
    if (!draft) return;
    const { data, dirty } = serializeForm(form);
    if (dirty) writeDraft(draft, data);
    else clearDraft(draft);
  };
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
      state.undo || state.link ? UNDO_VISIBLE_MS : SUCCESS_VISIBLE_MS,
    );
    return () => clearTimeout(timer);
  }, [state]);
  const shown =
    state.message && faded !== state && !(broadcast && state.ok) ? state : null;
  // The top progress bar runs while the action is on its way (also across a redirect).
  useEffect(() => {
    if (!pending) return;
    startProgress();
    return () => stopProgress();
  }, [pending]);
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
        setInvalid(null);
        event.currentTarget
          .querySelectorAll('.is-invalid')
          .forEach((el) => el.classList.remove('is-invalid'));
        const button = (event.nativeEvent as SubmitEvent).submitter;
        submitter.current = button;
        const form = new FormData(event.currentTarget, button);
        onPending?.(form);
        startTransition(() => dispatch(form));
      }}
      onChange={(event) => keep(event.currentTarget)}
      onInvalidCapture={(event) => {
        // One message for the first refused field; the field itself is focused and marked.
        event.preventDefault();
        if (burst.current) return;
        burst.current = true;
        setTimeout(() => {
          burst.current = false;
        }, 0);
        const el = event.target as HTMLInputElement;
        event.currentTarget
          .querySelectorAll('.is-invalid')
          .forEach((n) => n.classList.remove('is-invalid'));
        el.classList.add('is-invalid');
        el.focus();
        setInvalid(requiredMessage(el));
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
      {draft && kept && !pending && (
        <p className="form-draft">
          Draft kept on this device.
          <button
            type="button"
            className="undo-link"
            onClick={() => {
              clearDraft(draft);
              formRef.current?.reset();
            }}
          >
            Discard
          </button>
        </p>
      )}
      {invalid && !pending && (
        <p className="form-message" role="alert">
          {invalid}
        </p>
      )}
      {shown?.message && !pending && (
        <p
          className={shown.ok ? 'form-success' : 'form-message'}
          role={shown.ok ? 'status' : 'alert'}
        >
          {shown.ok && <Check size={14} aria-hidden="true" />}
          {shown.message}
          {shown.ok && shown.link && (
            <Link className="link" href={shown.link.href}>
              {shown.link.label}
            </Link>
          )}
          {shown.ok && shown.undo && (
            <UndoButton undo={shown.undo} onDone={() => setFaded(shown)} />
          )}
        </p>
      )}
    </form>
  );
}

/** "Role is required." from the field's label, or the fieldset's legend for a choice. */
function requiredMessage(el: HTMLInputElement) {
  const legend =
    el.type === 'radio'
      ? el.closest('fieldset')?.querySelector('legend')?.textContent?.trim()
      : null;
  if (legend) return `Answer “${legend}” first.`;
  const label = el.labels?.[0];
  const text =
    (label
      ? [...label.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim())
          .find(Boolean)
      : null) ??
    el.getAttribute('aria-label') ??
    el.getAttribute('placeholder') ??
    'This field';
  const name = text.replace(/\s*\((optional|required)\)\s*$/i, '').trim();
  if (el.validity.valueMissing) return `${name} is required.`;
  if (el.validity.typeMismatch || el.validity.patternMismatch)
    return `${name} does not look right.`;
  if (el.validity.rangeUnderflow || el.validity.rangeOverflow)
    return `${name} is out of range.`;
  return el.validationMessage || `${name} needs attention.`;
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
