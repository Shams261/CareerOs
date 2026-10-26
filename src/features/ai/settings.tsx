import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { shortDate, dayKey } from '@/lib/time';
import { aiCheckAction, aiEnabledAction } from './actions';
import {
  budgetLine,
  dollars,
  CAP_MICROS,
  MODEL_LABEL,
  PROVIDER_LABEL,
} from './domain';
import type { aiState } from './service';

type State = Awaited<ReturnType<typeof aiState>>;

/** The Settings row's line for Grill Me: "On · US$0.004 of US$3 used this month". */
export function aiContext(state: State) {
  if (!state.configured) return 'Not configured on this server';
  if (state.blocked) return `Unavailable · ${state.blocked}`;
  return `${state.enabled ? 'On' : 'Off'} · ${budgetLine(state.spent)}`;
}

/** The Grill Me panel in Settings (WI-031, ADR-022): the switch, the check and the rules. */
export function AiSettings({ state, zone }: { state: State; zone: string }) {
  if (!state.configured)
    return (
      <p>
        Grill Me needs an OpenRouter key on the server (OPENROUTER_API_KEY).
        Without it, no AI control appears anywhere.
      </p>
    );
  return (
    <div className="ai-settings">
      <p className="status-line">
        <span>
          {MODEL_LABEL} · {PROVIDER_LABEL}
        </span>
        <span>
          {budgetLine(state.spent)} · stops at{' '}
          {dollars(CAP_MICROS).replace('.00', '')} · resets{' '}
          {shortDate(state.resetDay)}
        </span>
        <span>
          {state.checkedAt
            ? `Provider checked ${shortDate(dayKey(state.checkedAt, zone))}`
            : 'Provider not checked yet'}
        </span>
      </p>
      {state.blocked && (
        <p className="form-message" role="status">
          Grill Me is off: {state.blocked}. It stays off until a check passes.
        </p>
      )}
      <ActionForm action={aiEnabledAction} label="Grill Me switch">
        <label className="check">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={state.enabled}
          />
          Offer Grill me on roadmap items
        </label>
        <Button className="secondary small">Save</Button>
      </ActionForm>
      <ActionForm action={aiCheckAction} label="Check the provider again">
        <Button className="secondary small">Check the provider again</Button>
      </ActionForm>
      <ul className="ai-rules">
        <li>
          Only the title, scope, “done when” and reference names you tick are
          sent. Your notes never are.
        </li>
        <li>One endpoint, with no fallback to another provider.</li>
        <li>No prompt or answer is stored; only the cards you keep.</li>
      </ul>
    </div>
  );
}
