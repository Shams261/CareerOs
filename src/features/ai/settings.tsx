import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { shortDate, dayKey } from '@/lib/time';
import { aiCheckAction, aiEnabledAction, aiLimitAction } from './actions';
import {
  budgetLine,
  dollars,
  LIMIT_CHOICES,
  MODEL_LABEL,
  PROVIDER_LABEL,
} from './domain';
import type { aiState } from './service';

type State = Awaited<ReturnType<typeof aiState>>;

/** The Settings row's line: "On · US$0.12 used this month", with the owner's limit if set. */
export function aiContext(state: State) {
  if (!state.configured) return 'Not configured on this server';
  if (state.blocked) return `Unavailable · ${state.blocked}`;
  return `${state.enabled ? 'On' : 'Off'} · ${budgetLine(state.spent, state.limit)}`;
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
          {budgetLine(state.spent, state.limit)} · resets{' '}
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
      <LimitForm limit={state.limit} />
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

const limitLabel = (l: number | null) =>
  l === null ? 'No limit' : dollars(l).replace('.00', '');
/**
 * The owner's monthly AI limit (WI-114): No limit by default, a few common amounts, or any
 * amount. It only stops new AI calls for the rest of the month; nothing else depends on it.
 */
function LimitForm({ limit }: { limit: number | null }) {
  const isChoice = LIMIT_CHOICES.includes(limit);
  return (
    <ActionForm action={aiLimitAction} label="Monthly AI limit">
      <fieldset className="choice-group is-chips ai-limit">
        <legend>Monthly AI limit</legend>
        {LIMIT_CHOICES.map((l) => (
          <label key={String(l)} className="choice">
            <input
              type="radio"
              name="limit"
              value={l === null ? 'none' : String(l / 1e6)}
              defaultChecked={l === limit}
            />
            {limitLabel(l)}
          </label>
        ))}
        <label className="choice">
          <input
            type="radio"
            name="limit"
            value="other"
            defaultChecked={!isChoice}
          />
          Other
        </label>
        <label className="ai-limit-amount">
          <span>US$</span>
          <input
            type="number"
            name="amount"
            min="0.1"
            max="1000"
            step="0.1"
            inputMode="decimal"
            aria-label="Other monthly limit in US dollars"
            defaultValue={!isChoice && limit !== null ? limit / 1e6 : undefined}
          />
        </label>
      </fieldset>
      <Button className="secondary small">Save limit</Button>
    </ActionForm>
  );
}
