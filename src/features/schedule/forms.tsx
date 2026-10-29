import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { FormMore } from '@/components/form-more';
import { TemplateChips } from './template-chips';
import { LengthFields, QuickBlockFields } from './quick-fields';
import { LOG_LENGTHS, logDefaults } from './log-time';
import type { RoutineTemplate } from './templates';
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
  defaultStart = '09:00',
  defaultEnd = '10:00',
}: {
  day: string;
  zone: string;
  goals: GoalOption[];
  block?: TimeBlock;
  /** A new block's times; Today passes the next free quarter hour (WI-066). */
  defaultStart?: string;
  defaultEnd?: string;
}) {
  // One short form for adding and editing (WI-068): title, kind, start, length and a note in
  // view; the goal, priority and another day under More. A new block is on this day.
  const local = (d: Date, pattern: string) =>
    formatInTimeZone(d, zone, pattern);
  return (
    <ActionForm
      action={blockAction}
      label={block ? 'Edit this day only' : 'Add a block'}
      resetOnSuccess={!block}
      broadcast="blocks"
      closeOnSuccess
      draft={block ? undefined : `block:${day}`}
      className="block-form"
    >
      <input type="hidden" name="id" value={block?.id ?? ''} />
      <input
        type="hidden"
        name="version"
        value={block?.updatedAt.toISOString() ?? ''}
      />
      <QuickBlockFields
        defaultTitle={block?.title}
        defaultKind={block?.category}
        defaultStart={block ? local(block.plannedStart, 'HH:mm') : defaultStart}
        defaultEnd={block ? local(block.plannedEnd, 'HH:mm') : defaultEnd}
        defaultNote={block?.description ?? ''}
      />
      <FormMore label="More: goal, priority, another day">
        <div className="form-grid">
          <label>
            Goal
            <select name="goalId" defaultValue={block?.goalId ?? ''}>
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
            <select name="priority" defaultValue={block?.priority ?? 2}>
              <option value={1}>High</option>
              <option value={2}>Normal</option>
              <option value={3}>Low</option>
            </select>
          </label>
          <label>
            Day
            <input
              required
              type="date"
              name="day"
              defaultValue={
                block ? local(block.plannedStart, 'yyyy-MM-dd') : day
              }
            />
          </label>
          <label>
            Ends on
            <input
              required
              type="date"
              name="endDay"
              defaultValue={block ? local(block.plannedEnd, 'yyyy-MM-dd') : day}
            />
          </label>
        </div>
      </FormMore>
      {/* Outside More: an overlap refusal asks for this box, so it must be in view. */}
      <label className="check">
        <input type="checkbox" name="allowOverlap" /> Allow this overlap
      </label>
      <Button className="mt-3">{block ? 'Save' : 'Add block'}</Button>
    </ActionForm>
  );
}
/** `compact` is the first-run form: title, category, days and time only. */
export function RoutineForm({
  routine,
  goals,
  compact = false,
  templates = [],
}: {
  routine?: RoutineBlock;
  goals: GoalOption[];
  compact?: boolean;
  /** Template chips for a new routine (WI-059); they only fill the form. */
  templates?: RoutineTemplate[];
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
      {!routine && <TemplateChips templates={templates} />}
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
  primaryOnly = false,
  canDelete = false,
  resume = false,
}: {
  block: TimeBlock;
  canStart?: boolean;
  /** The block happening now: its Start answers the S shortcut. */
  current?: boolean;
  launcher?: boolean;
  hideStart?: boolean;
  more?: boolean;
  /** Only the primary Start or Stop; the row keeps the secondary actions. */
  primaryOnly?: boolean;
  /** Delete in the row's menu (WI-066): a block with no recorded time. */
  canDelete?: boolean;
  /** Paused (WI-067): recorded time and no running session; Start reads Resume. */
  resume?: boolean;
}) {
  const deleteButton = canDelete ? (
    <Button
      className={`secondary danger${more ? ' small' : ''}`}
      name="action"
      value="delete"
    >
      Delete<span className="sr-only">: {block.title}</span>
    </Button>
  ) : null;
  const running = block.status === 'IN_PROGRESS';
  return (
    // A row's result (Deleted, Skipped, Cancelled, with Undo) shows above the list, since the
    // row itself may go (WI-066).
    <ActionForm
      action={executionAction}
      broadcast={more || launcher ? 'blocks' : undefined}
    >
      <input type="hidden" name="id" value={block.id} />
      <div className="actions">
        {['PLANNED', 'IN_PROGRESS'].includes(block.status) ? (
          <>
            {(canStart || running) &&
              !hideStart &&
              !(more && !current) &&
              (running ? (
                launcher ? (
                  // The launcher's running session finishes with Complete first (WI-060).
                  <>
                    <Link
                      className="button secondary"
                      href="/focus"
                      prefetch={false}
                    >
                      Focus<span className="sr-only">: {block.title}</span>
                    </Link>
                    <button
                      className="button secondary"
                      name="action"
                      value="stop"
                    >
                      Pause<span className="sr-only">: {block.title}</span>
                    </button>
                    <button className="button" name="action" value="complete">
                      Complete<span className="sr-only">: {block.title}</span>
                    </button>
                  </>
                ) : (
                  <button className="button" name="action" value="stop">
                    Pause<span className="sr-only">: {block.title}</span>
                  </button>
                )
              ) : (
                // Start begins the session and opens Focus already running (WI-066); a paused
                // block Resumes, and the launcher offers Complete beside it (WI-067).
                <>
                  {launcher && resume && (
                    <button
                      className="button secondary"
                      name="action"
                      value="complete"
                    >
                      Complete<span className="sr-only">: {block.title}</span>
                    </button>
                  )}
                  <button
                    className={
                      current
                        ? 'button'
                        : `button secondary${more ? ' small' : ''}`
                    }
                    name="action"
                    value="focus"
                    data-shortcut={current ? 'start' : undefined}
                  >
                    {resume ? 'Resume' : launcher ? 'Start session' : 'Start'}
                    <span className="sr-only">: {block.title}</span>
                  </button>
                </>
              ))}
            {!primaryOnly && (
              <SecondaryActions title={block.title} always={more}>
                {more && !current && canStart && !hideStart && !running && (
                  <button
                    className="button secondary small"
                    name="action"
                    value="focus"
                  >
                    {resume ? 'Resume' : 'Start'}
                    <span className="sr-only">: {block.title}</span>
                  </button>
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
                      Cancel block
                      <span className="sr-only">: {block.title}</span>
                    </Button>
                    {deleteButton}
                  </>
                )}
              </SecondaryActions>
            )}
          </>
        ) : more ? (
          <SecondaryActions title={block.title} always>
            <Button className="secondary small" name="action" value="reset">
              Reset to planned<span className="sr-only">: {block.title}</span>
            </Button>
            {deleteButton}
          </SecondaryActions>
        ) : (
          <Button className="secondary" name="action" value="reset">
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
  now = new Date(),
}: {
  block: TimeBlock;
  zone: string;
  day: string;
  now?: Date;
}) {
  // Log time in one row (WI-067): when it started and how long; the dates and a note sit
  // under More. Its first answer never ends in the future (WI-068): the block's slot once it
  // is over, else the time up to now, as long as the block, which Save accepts.
  const range = logDefaults(block, now);
  const at = (d: Date, pattern: string) => formatInTimeZone(d, zone, pattern);
  return (
    <ActionForm action={manualAction} label={`Log time for ${block.title}`}>
      <input type="hidden" name="id" value={block.id} />
      <LengthFields
        startName="startLocal"
        endName="endLocal"
        startLabel="Started at"
        endLabel="Ended at"
        defaultStart={at(range.start, 'HH:mm')}
        defaultEnd={at(range.end, 'HH:mm')}
        lengths={LOG_LENGTHS}
      />
      <FormMore label="More: another day, a note">
        <div className="form-grid">
          <label>
            Started on
            <input
              name="day"
              type="date"
              required
              defaultValue={at(range.start, 'yyyy-MM-dd') || day}
            />
          </label>
          <label>
            Ended on
            <input
              name="endDay"
              type="date"
              required
              defaultValue={at(range.end, 'yyyy-MM-dd') || day}
            />
          </label>
        </div>
        <label>
          Notes
          <textarea name="notes" maxLength={1000} />
        </label>
      </FormMore>
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
