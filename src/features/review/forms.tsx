import { ActionForm } from '@/components/action-form';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import type {
  NotificationPreference,
  WeeklyPriority,
  WeeklyReview,
} from '@/generated/prisma/client';
import {
  prepareNextWeekAction,
  completeReviewAction,
  priorityAction,
  priorityChangeAction,
  reviewAction,
  weeklyReminderAction,
} from './actions';
import { MAX_PRIORITIES } from './domain';
import { ArrowRight, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

const prompts = [
  ['biggestWin', 'What went well?'],
  ['biggestBlocker', 'What got in the way?'],
  ['nextWeekChange', 'What will I change next week?'],
  ['lessons', 'What did I learn?'],
  ['carryForward', 'Still to do'],
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
      draft={`reflection:${weekStart}`}
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
        <Button className="secondary" name="intent" value="draft">
          Save draft
        </Button>
        <Button name="intent" value="next">
          Save and continue <ArrowRight size={14} aria-hidden="true" />
        </Button>
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
  if (!priorities.length)
    return (
      <>
        <FeedbackOutlet channel="priorities" />
        <p className="muted">No priorities yet.</p>
      </>
    );
  return (
    <>
      <FeedbackOutlet channel="priorities" />
      <ol className="plain-list">
        {priorities.map((p, i) => (
          <li className="prep-item" key={p.id}>
            <span>
              {p.completedAt ? (
                <>
                  <Check size={14} aria-hidden="true" /> Done:{' '}
                </>
              ) : (
                `${i + 1}. `
              )}
              {p.title}
              {p.target
                ? ` · target ${p.target}${p.targetUnit ? ` ${p.targetUnit}` : ''}`
                : ''}
              {p.category ? (
                <span className="muted"> · {p.category}</span>
              ) : null}
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
                    broadcast="priorities"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="op" value={op} />
                    <button
                      className="button secondary"
                      aria-label={`${labels[op]}: ${p.title}`}
                    >
                      {glyphs[op] ?? labels[op]}
                    </button>
                  </ActionForm>
                ))}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
const labels = {
  up: 'Move up',
  down: 'Move down',
  done: 'Mark done',
  undo: 'Reopen',
  remove: 'Remove',
} as const;
const glyphs: Partial<Record<keyof typeof labels, React.ReactNode>> = {
  up: <ChevronUp size={16} aria-hidden="true" />,
  down: <ChevronDown size={16} aria-hidden="true" />,
};

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
      broadcast="priorities"
      className="dsa-form"
      resetOnSuccess
      draft={`priority:${weekStart}`}
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
      <Button className="secondary">Add priority</Button>
    </ActionForm>
  );
}

export function PrepareNextWeekForm({ monday }: { monday: string }) {
  return (
    <ActionForm action={prepareNextWeekAction} label="Prepare next week">
      <input type="hidden" name="monday" value={monday} />
      <Button>Prepare next week from my routines</Button>
    </ActionForm>
  );
}
/** Step three's closing action: the review is complete once priorities are set. */
export function CompleteReviewForm({
  weekStart,
  completedAt,
}: {
  weekStart: string;
  completedAt: Date | null;
}) {
  return (
    <ActionForm action={completeReviewAction} label="Complete review">
      <input type="hidden" name="weekStart" value={weekStart} />
      <div className="step-foot">
        {completedAt ? (
          <span className="pill success">Completed</span>
        ) : (
          <Button>Complete review</Button>
        )}
      </div>
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
      <Button className="secondary">Save reminder</Button>
    </ActionForm>
  );
}
