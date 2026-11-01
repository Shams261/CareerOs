import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { ConfirmDelete } from '@/components/confirm-delete';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { shortDate } from '@/lib/time';
import {
  addMemoryAction,
  forgetRumiAction,
  memoryEnabledAction,
  removeMemoryAction,
  rumiStyleAction,
} from './actions';
import { AGENT_NAME, RUMI_STYLES, type RumiStyle } from './domain';
import {
  KIND_LABELS,
  MEMORY,
  MEMORY_KINDS,
  STALE_DAYS,
  type MemoryRow,
} from './memory-domain';
import { MemoryToggle, StyleSwitch } from './memory-controls';

export { memoryContext } from './memory-domain';

const STYLE_WORDS: Record<RumiStyle, string> = {
  firm: 'Firm',
  warm: 'Warm',
  brief: 'Brief',
};

/**
 * Settings → "Rumi knows" (WI-040; WI-100): the lines Rumi keeps in mind, grouped by kind,
 * each with who wrote it and when it lapses, removable with Undo; a line the owner adds with
 * its kind; the switch for notes from conversations, the style, and Forget everything.
 */
export function MemorySettings({
  lines,
  today,
  memoryEnabled,
  style,
}: {
  lines: MemoryRow[];
  today: string;
  memoryEnabled: boolean;
  style: RumiStyle;
}) {
  const staleBefore = new Date(
    +new Date(`${today}T00:00:00Z`) - STALE_DAYS * 86400000,
  );
  const rumi = lines.filter((l) => l.source === 'RUMI').length;
  return (
    <div className="rumi-memory">
      <div className="rumi-setting-row">
        <span>
          <strong>Style</strong>
          <span className="muted"> · how {AGENT_NAME} speaks</span>
        </span>
        <StyleSwitch
          style={style}
          action={rumiStyleAction}
          options={RUMI_STYLES.map((s) => [s, STYLE_WORDS[s]])}
        />
      </div>
      <div className="rumi-setting-row">
        <span>
          <strong>Notes from conversations</strong>
          <span className="muted">
            {' '}
            · {AGENT_NAME} keeps what you state about yourself
          </span>
        </span>
        <MemoryToggle enabled={memoryEnabled} action={memoryEnabledAction} />
      </div>
      {/* The row leaves with its form; the answer and its Undo show here (WI-014). */}
      <FeedbackOutlet channel="rumi-memory" className="mt-3" />
      {lines.length ? (
        MEMORY_KINDS.map((kind) => {
          const rows = lines.filter((l) => l.kind === kind);
          if (!rows.length) return null;
          return (
            <section key={kind} className="rumi-memory-group">
              <h3 className="rumi-memory-kind">
                {KIND_LABELS[kind]}s
                <span className="muted"> · {rows.length}</span>
              </h3>
              <ul className="plain-list rumi-memory-list">
                {rows.map((l) => {
                  const facts = [
                    l.source === 'RUMI'
                      ? `by ${AGENT_NAME} · ${shortDate(l.createdAt.toISOString().slice(0, 10))}`
                      : 'you',
                    l.expiresAt
                      ? `until ${shortDate(l.expiresAt.toISOString().slice(0, 10))}`
                      : null,
                    !l.expiresAt && (l.lastUsedAt ?? l.createdAt) < staleBefore
                      ? `not mentioned since ${shortDate((l.lastUsedAt ?? l.createdAt).toISOString().slice(0, 10))}`
                      : null,
                  ].filter(Boolean);
                  return (
                    <li key={l.id}>
                      <span>
                        {l.text}
                        <span className="muted rumi-memory-facts">
                          {' '}
                          · {facts.join(' · ')}
                        </span>
                      </span>
                      <ActionForm
                        action={removeMemoryAction}
                        label="Remove this line"
                        broadcast="rumi-memory"
                      >
                        <input type="hidden" name="id" value={l.id} />
                        <Button className="secondary small">Remove</Button>
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      ) : (
        <p>
          Nothing yet. Add what {AGENT_NAME} should know, such as your best
          hours or your rest day; {AGENT_NAME} also notes what you tell it in a
          conversation.
        </p>
      )}
      {lines.length < MEMORY.items && (
        <ActionForm
          action={addMemoryAction}
          label={`Add a line for ${AGENT_NAME}`}
          resetOnSuccess
          className="rumi-memory-add"
        >
          <label>
            Keep in mind
            <input
              name="text"
              maxLength={MEMORY.text}
              required
              placeholder="I focus best between 06:00 and 09:00"
            />
          </label>
          <label>
            Kind
            <select name="kind" defaultValue="PREFERENCE">
              {MEMORY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <Button className="small">Add</Button>
        </ActionForm>
      )}
      {rumi > 0 && (
        <div className="panel-danger">
          <ConfirmDelete
            action={forgetRumiAction}
            id="rumi"
            label={`Forget everything ${AGENT_NAME} noted`}
            question={`Forget the ${rumi} ${rumi === 1 ? 'line' : 'lines'} ${AGENT_NAME} noted? Your own lines stay.`}
          />
        </div>
      )}
    </div>
  );
}
