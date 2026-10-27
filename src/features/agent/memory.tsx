import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { addMemoryAction, removeMemoryAction } from './actions';
import { AGENT_NAME, MEMORY } from './domain';

/** The Settings row's line: "3 lines" or "Nothing yet". */
export const memoryContext = (count: number) =>
  count ? `${count} ${count === 1 ? 'line' : 'lines'}` : 'Nothing yet';

/**
 * Settings → "Rumi knows" (WI-040): lines the owner writes for Rumi to keep in mind, sent with
 * every message. Nothing is added without the owner; each line can be removed.
 */
export function MemorySettings({
  lines,
}: {
  lines: { id: string; text: string }[];
}) {
  return (
    <div className="rumi-memory">
      {lines.length ? (
        <ul className="plain-list rumi-memory-list">
          {lines.map((l) => (
            <li key={l.id}>
              <span>{l.text}</span>
              <ActionForm action={removeMemoryAction} label="Remove this line">
                <input type="hidden" name="id" value={l.id} />
                <Button className="secondary small">Remove</Button>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          Nothing yet. Add what {AGENT_NAME} should know, such as your best
          hours or your rest day.
        </p>
      )}
      {lines.length < MEMORY.items && (
        <ActionForm
          action={addMemoryAction}
          label={`Add a line for ${AGENT_NAME}`}
          resetOnSuccess
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
          <Button className="small">Add</Button>
        </ActionForm>
      )}
    </div>
  );
}
