import { ActionForm } from '@/components/action-form';
import { FormMore } from '@/components/form-more';
import {
  blockAction,
  routineAction,
  executionAction,
  manualAction,
  reviewAction,
} from './actions';
import type {
  RoutineBlock,
  TimeBlock,
  DailyCheckIn,
} from '@/generated/prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { Button } from '@/components/ui/button';
import {
  SecondaryActions,
  SkipStep,
} from '@/features/execution/secondary-actions';
export type GoalOption = { id: string; title: string };
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function CommonFields({
  goals,
  value,
  compact = false,
}: {
  goals: GoalOption[];
  value?: {
    title: string;
    category: string;
    description: string | null;
    goalId: string | null;
    priority: number;
  };
  compact?: boolean;
}) {
  return (
    <>
      <div className="form-grid">
        <label>
          Title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={value?.title}
            placeholder="DSA practice"
          />
        </label>
        <label>
          Category
          <input
            name="category"
            required
            maxLength={80}
            list="activity-categories"
            defaultValue={value?.category ?? 'DSA'}
          />
        </label>
        {compact ? (
          <>
            <input type="hidden" name="priority" value={value?.priority ?? 2} />
            <input type="hidden" name="goalId" value={value?.goalId ?? ''} />
            <input type="hidden" name="description" value="" />
          </>
        ) : (
          <>
            <label>
              Goal
              <select name="goalId" defaultValue={value?.goalId ?? ''}>
                <option value="">No goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue={value?.priority ?? 2}>
                <option value={1}>High</option>
                <option value={2}>Normal</option>
                <option value={3}>Low</option>
              </select>
            </label>
          </>
        )}
      </div>
      {!compact && (
        <label>
          Notes
          <textarea
            name="description"
            maxLength={1000}
            defaultValue={value?.description ?? ''}
          />
        </label>
      )}
    </>
  );
}
export function CategoryOptions() {
  return (
    <datalist id="activity-categories">
      {[
        'DSA',
        'SYSTEM_DESIGN',
        'TECHNICAL',
        'JOB_SEARCH',
        'LINKEDIN',
        'GYM',
        'WORK',
        'PERSONAL',
        'OTHER',
      ].map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}
export function BlockForm({
  day,
  zone,
  goals,
  block,
}: {
  day: string;
  zone: string;
  goals: GoalOption[];
  block?: TimeBlock;
}) {
  return (
    <ActionForm
      action={blockAction}
      label={block ? 'Edit this day only' : 'Add a block'}
      resetOnSuccess={!block}
      broadcast="blocks"
      closeOnSuccess
      draft={block ? undefined : `block:${day}`}
    >
      <input type="hidden" name="id" value={block?.id ?? ''} />
      <input
        type="hidden"
        name="version"
        value={block?.updatedAt.toISOString() ?? ''}
      />
      <CommonFields goals={goals} value={block} />
      <div className="form-grid">
        <label>
          Start date
          <input
            required
            type="date"
            name="day"
            defaultValue={
              block
                ? formatInTimeZone(block.plannedStart, zone, 'yyyy-MM-dd')
                : day
            }
          />
        </label>
        <label>
          Start time
          <input
            required
            type="time"
            name="startLocal"
            defaultValue={
              block
                ? formatInTimeZone(block.plannedStart, zone, 'HH:mm')
                : '09:00'
            }
          />
        </label>
        <label>
          End date
          <input
            required
            type="date"
            name="endDay"
            defaultValue={
              block
                ? formatInTimeZone(block.plannedEnd, zone, 'yyyy-MM-dd')
                : day
            }
          />
        </label>
        <label>
          End time
          <input
            required
            type="time"
            name="endLocal"
            defaultValue={
              block
                ? formatInTimeZone(block.plannedEnd, zone, 'HH:mm')
                : '10:00'
            }
          />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="allowOverlap" /> Allow overlap with another
        block
      </label>
      <Button className="mt-3">
        {block ? 'Save for this day' : 'Add block'}
      </Button>
    </ActionForm>
  );
}
/** `compact` is the first-run form: title, category, days and time only. */
export function RoutineForm({
  routine,
  goals,
  compact = false,
}: {
  routine?: RoutineBlock;
  goals: GoalOption[];
  compact?: boolean;
}) {
  // The short form: title, days and time. Everything else sits behind More and opens by
  // itself when an existing routine uses any of it.
  const moreOpen =
    !!routine &&
    (!!routine.description ||
      !!routine.goalId ||
      routine.priority !== 2 ||
      !routine.enabled);
  return (
    <ActionForm
      action={routineAction}
      label={routine ? `Edit routine ${routine.title}` : 'Add routine'}
      resetOnSuccess={!routine}
      draft={routine ? undefined : 'routine:new'}
    >
      <input type="hidden" name="id" value={routine?.id ?? ''} />
      <input
        type="hidden"
        name="version"
        value={routine?.updatedAt.toISOString() ?? ''}
      />
      <label>
        Title
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={routine?.title}
          placeholder="DSA practice"
        />
      </label>
      <fieldset>
        <legend>Repeat on</legend>
        <div className="weekday-picker">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label className="check" key={d}>
              <input
                type="checkbox"
                name="weekdays"
                value={d}
                defaultChecked={
                  routine?.weekdays.includes(d) ?? [1, 2, 3, 4, 5].includes(d)
                }
              />
              {WEEKDAY[d]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Start time
          <input
            required
            type="time"
            name="startLocal"
            defaultValue={routine?.startLocal ?? '07:30'}
          />
        </label>
        <label>
          End time
          <input
            required
            type="time"
            name="endLocal"
            defaultValue={routine?.endLocal ?? '09:00'}
          />
        </label>
      </div>
      {routine && (
        <label>
          Apply changes to
          <select name="scope" defaultValue="template">
            <option value="template">Only days not planned yet</option>
            <option value="future">
              Also this week&apos;s planned days (preview first)
            </option>
          </select>
        </label>
      )}
      <FormMore
        label="More: category, goal, priority, notes"
        defaultOpen={moreOpen}
      >
        <div className="form-grid">
          <label>
            Category
            <input
              name="category"
              required
              maxLength={80}
              list="activity-categories"
              defaultValue={routine?.category ?? 'DSA'}
            />
          </label>
          <label>
            Goal
            <select name="goalId" defaultValue={routine?.goalId ?? ''}>
              <option value="">No goal</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" defaultValue={routine?.priority ?? 2}>
              <option value={1}>High</option>
              <option value={2}>Normal</option>
              <option value={3}>Low</option>
            </select>
          </label>
        </div>
        <label>
          Notes
          <textarea
            name="description"
            maxLength={1000}
            defaultValue={routine?.description ?? ''}
          />
        </label>
        {compact ? (
          <input type="hidden" name="enabled" value="on" />
        ) : (
          <label className="check">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={routine?.enabled ?? true}
            />{' '}
            Active
          </label>
        )}
        <label className="check">
          <input type="checkbox" name="allowOverlap" /> Allow overlap with other
          routines or blocks
        </label>
      </FormMore>
      <div className="actions mt-3">
        <Button>{routine ? 'Save routine' : 'Add routine'}</Button>
        {routine && (
          <Button className="destructive" name="remove" value="on">
            Remove routine (preview first)
          </Button>
        )}
      </div>
    </ActionForm>
  );
}
/**
 * `canStart` is false for any day but today: sessions are recorded against the present.
 * Only the block happening now (`current`) or a running one gets the primary button;
 * every other Start is secondary. A running block offers Stop and Complete only.
 * `launcher` labels the primary action "Start session" / "Stop session"; `hideStart`
 * keeps an agenda row from duplicating the launcher's control; `more` puts the secondary
 * actions behind a labelled More button at every width (the agenda rows).
 */
export function ExecutionControls({
  block,
  canStart = true,
  current = false,
  launcher = false,
  hideStart = false,
  more = false,
}: {
  block: TimeBlock;
  canStart?: boolean;
  /** The block happening now: its Start answers the S shortcut. */
  current?: boolean;
  launcher?: boolean;
  hideStart?: boolean;
  more?: boolean;
}) {
  const running = block.status === 'IN_PROGRESS';
  return (
    <ActionForm action={executionAction}>
      <input type="hidden" name="id" value={block.id} />
      <div className="actions">
        {['PLANNED', 'IN_PROGRESS'].includes(block.status) ? (
          <>
            {(canStart || running) && !hideStart && !(more && !current) && (
              <button
                className={
                  current || running
                    ? 'button'
                    : `button secondary${more ? ' small' : ''}`
                }
                name="action"
                value={running ? 'stop' : 'start'}
                data-shortcut={current && !running ? 'start' : undefined}
              >
                {running
                  ? launcher
                    ? 'Stop session'
                    : 'Stop'
                  : launcher
                    ? 'Start session'
                    : 'Start'}
                <span className="sr-only">: {block.title}</span>
              </button>
            )}
            <SecondaryActions title={block.title} always={more}>
              {more && !current && canStart && !hideStart && !running && (
                <Button className="secondary small" name="action" value="start">
                  Start<span className="sr-only">: {block.title}</span>
                </Button>
              )}
              <Button
                className={`secondary${more ? ' small' : ''}`}
                name="action"
                value="complete"
              >
                Complete<span className="sr-only">: {block.title}</span>
              </Button>
              {!running && (
                <>
                  <SkipStep title={block.title} small={more} />
                  <Button
                    className={`secondary${more ? ' small' : ''}`}
                    name="action"
                    value="cancel"
                  >
                    Cancel block<span className="sr-only">: {block.title}</span>
                  </Button>
                </>
              )}
            </SecondaryActions>
          </>
        ) : (
          <Button
            className={`secondary${more ? ' small' : ''}`}
            name="action"
            value="reset"
          >
            Reset to planned<span className="sr-only">: {block.title}</span>
          </Button>
        )}
      </div>
    </ActionForm>
  );
}
export function ManualSessionForm({
  block,
  zone,
  day,
}: {
  block: TimeBlock;
  zone: string;
  day: string;
}) {
  return (
    <ActionForm action={manualAction} label={`Log time for ${block.title}`}>
      <input type="hidden" name="id" value={block.id} />
      <div className="form-grid">
        <label>
          Started on
          <input name="day" type="date" required defaultValue={day} />
        </label>
        <label>
          Started at
          <input
            name="startLocal"
            type="time"
            required
            defaultValue={formatInTimeZone(block.plannedStart, zone, 'HH:mm')}
          />
        </label>
        <label>
          Ended on
          <input name="endDay" type="date" required defaultValue={day} />
        </label>
        <label>
          Ended at
          <input
            name="endLocal"
            type="time"
            required
            defaultValue={formatInTimeZone(block.plannedEnd, zone, 'HH:mm')}
          />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" maxLength={1000} />
      </label>
      <Button className="mt-3">Save time</Button>
    </ActionForm>
  );
}
export function ReviewForm({
  day,
  review,
}: {
  day: string;
  review?: DailyCheckIn | null;
}) {
  return (
    <ActionForm
      action={reviewAction}
      label="Daily review"
      className="review-form"
      draft={`daily-review:${day}`}
      broadcast="review"
      closeOnSuccess
    >
      <input type="hidden" name="day" value={day} />
      <fieldset className="rating-steps">
        <legend>Overall day (optional)</legend>
        <div className="rating-options">
          {[1, 2, 3, 4, 5].map((n) => (
            <label className="rating-step" key={n}>
              <input
                type="radio"
                name="rating"
                value={n}
                defaultChecked={review?.rating === n}
              />
              <span>{n}</span>
            </label>
          ))}
          <label className="rating-step rating-clear">
            <input
              type="radio"
              name="rating"
              value=""
              defaultChecked={!review?.rating}
            />
            <span>No rating</span>
          </label>
        </div>
      </fieldset>
      <label>
        What went well? (optional)
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={review?.notes ?? ''}
        />
      </label>
      <FormMore
        label="More: blocker, carry to tomorrow"
        defaultOpen={!!(review?.blocker || review?.carryForward)}
      >
        <label>
          Main blocker (optional)
          <input
            name="blocker"
            maxLength={500}
            defaultValue={review?.blocker ?? ''}
          />
        </label>
        <label>
          Carry to tomorrow (optional)
          <input
            name="carryForward"
            maxLength={500}
            defaultValue={review?.carryForward ?? ''}
          />
        </label>
      </FormMore>
      <Button className="mt-3">
        {review ? 'Save review' : 'Save and close the day'}
      </Button>
    </ActionForm>
  );
}
