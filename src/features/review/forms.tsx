import { ActionForm } from '@/components/action-form';
import type {
  NotificationPreference,
  WeeklyPriority,
  WeeklyReview,
} from '@/generated/prisma/client';
import {
  prepareNextWeekAction,
  priorityAction,
  priorityChangeAction,
  reviewAction,
  weeklyReminderAction,
} from './actions';
import { MAX_PRIORITIES } from './domain';

const prompts = [
  ['biggestWin', 'Biggest win'],
  ['biggestBlocker', 'Biggest blocker'],
  ['lessons', 'What did I learn?'],
  ['nextWeekChange', 'What should I change next week?'],
  ['carryForward', 'Carry forward'],
] as const;

/** Five optional short prompts. Save draft or complete; completed reviews stay editable. */
export function ReviewForm({
  weekStart,
  review,
}: {
  weekStart: string;
  review: WeeklyReview | null;
}) {
  return (
    <ActionForm
      action={reviewAction}
      label="Weekly reflection"
      className="dsa-form"
    >
      <input type="hidden" name="weekStart" value={weekStart} />
      <div className="form-grid">
        {prompts.map(([name, label]) => (
          <label key={name}>
            {label} (optional)
            <textarea
              name={name}
              rows={2}
              maxLength={1000}
              defaultValue={review?.[name] ?? ''}
            />
          </label>
        ))}
      </div>
      <div className="actions">
        <button className="button secondary" name="intent" value="draft">
          Save draft
        </button>
        <button className="button" name="intent" value="complete">
          {review?.completedAt ? 'Save completed review' : 'Complete review'}
        </button>
      </div>
    </ActionForm>
  );
}

export function PriorityList({
  priorities,
  editable,
}: {
  priorities: WeeklyPriority[];
  editable: boolean;
}) {
  if (!priorities.length) return <p className="muted">No priorities yet.</p>;
  return (
    <ol className="plain-list">
      {priorities.map((p, i) => (
        <li className="prep-item" key={p.id}>
          <span>
            {p.completedAt ? '✓ Done: ' : `${i + 1}. `}
            {p.title}
            {p.target
              ? ` · target ${p.target}${p.targetUnit ? ` ${p.targetUnit}` : ''}`
              : ''}
            {p.category ? <span className="muted"> · {p.category}</span> : null}
          </span>
          <span className="actions">
            {(editable
              ? ([
                  'up',
                  'down',
                  p.completedAt ? 'undo' : 'done',
                  'remove',
                ] as const)
              : ([p.completedAt ? 'undo' : 'done'] as const)
            )
              .filter(
                (op) =>
                  !(op === 'up' && i === 0) &&
                  !(op === 'down' && i === priorities.length - 1),
              )
              .map((op) => (
                <ActionForm
                  key={op}
                  action={priorityChangeAction}
                  label={`${op} ${p.title}`}
                >
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="op" value={op} />
                  <button
                    className="button secondary"
                    aria-label={`${labels[op]}: ${p.title}`}
                  >
                    {labels[op]}
                  </button>
                </ActionForm>
              ))}
          </span>
        </li>
      ))}
    </ol>
  );
}
const labels = {
  up: '↑',
  down: '↓',
  done: 'Mark done',
  undo: 'Reopen',
  remove: 'Remove',
} as const;

export function PriorityForm({
  weekStart,
  count,
  goals,
}: {
  weekStart: string;
  count: number;
  goals: { id: string; title: string }[];
}) {
  if (count >= MAX_PRIORITIES)
    return (
      <p className="muted">
        {MAX_PRIORITIES} priorities chosen — remove one to add another.
      </p>
    );
  return (
    <ActionForm
      action={priorityAction}
      label="Add priority"
      className="dsa-form"
      resetOnSuccess
    >
      <input type="hidden" name="weekStart" value={weekStart} />
      <div className="form-grid">
        <label>
          Priority
          <input
            name="title"
            required
            maxLength={160}
            placeholder="Finish Sliding Window"
          />
        </label>
        <label>
          Category (optional)
          <input name="category" maxLength={60} placeholder="DSA" />
        </label>
        <label>
          Target (optional number)
          <input name="target" type="number" min="1" max="1000" />
        </label>
        <label>
          Target unit (optional)
          <input name="targetUnit" maxLength={40} placeholder="applications" />
        </label>
        {goals.length > 0 && (
          <label>
            Goal (optional)
            <select name="goalId" defaultValue="">
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <button className="button secondary">Add priority</button>
    </ActionForm>
  );
}

export function PrepareNextWeekForm({ monday }: { monday: string }) {
  return (
    <ActionForm action={prepareNextWeekAction} label="Prepare next week">
      <input type="hidden" name="monday" value={monday} />
      <p className="muted">
        Generates next week&apos;s dated plans from your routines. Days already
        generated (and any one-off edits) are left alone. Google Calendar, if
        connected, publishes afterwards.
      </p>
      <button className="button">Prepare next week</button>
    </ActionForm>
  );
}

export function WeeklyReminderForm({
  pref,
}: {
  pref: NotificationPreference | null;
}) {
  return (
    <ActionForm
      action={weeklyReminderAction}
      label="Weekly review reminder"
      className="dsa-form"
    >
      <label className="check">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={pref?.enabled ?? false}
        />
        Sunday reminder when the week is not reviewed yet
      </label>
      <label>
        Reminder time
        <input
          type="time"
          name="preferredTime"
          required
          defaultValue={pref?.preferredTime ?? '18:00'}
        />
      </label>
      <p className="muted">
        One in-app inbox reminder per week. No closed-app push.
      </p>
      <button className="button secondary">Save reminder</button>
    </ActionForm>
  );
}
