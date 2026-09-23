import { ActionForm } from '@/components/action-form';
import {
  blockAction,
  routineAction,
  generationAction,
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
import { shiftDay } from './domain';
export type GoalOption = { id: string; title: string };
function CommonFields({
  goals,
  value,
}: {
  goals: GoalOption[];
  value?: {
    title: string;
    category: string;
    description: string | null;
    goalId: string | null;
    priority: number;
  };
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
      </div>
      <label>
        Notes
        <textarea
          name="description"
          maxLength={1000}
          defaultValue={value?.description ?? ''}
        />
      </label>
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
      label={block ? 'Edit this occurrence only' : 'Add a block'}
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
        <input type="checkbox" name="allowOverlap" /> Allow this overlap if
        another block conflicts
      </label>
      <p className="muted">
        {zone}. Only this dated occurrence changes. Actual sessions and
        recurring routines stay intact.
      </p>
      <button className="button mt-3">
        {block ? 'Save this occurrence' : 'Add block'}
      </button>
    </ActionForm>
  );
}
export function RoutineForm({
  routine,
  goals,
}: {
  routine?: RoutineBlock;
  goals: GoalOption[];
}) {
  return (
    <ActionForm
      action={routineAction}
      label={
        routine ? `Edit routine ${routine.title}` : 'Create recurring routine'
      }
    >
      <input type="hidden" name="id" value={routine?.id ?? ''} />
      <input
        type="hidden"
        name="version"
        value={routine?.updatedAt.toISOString() ?? ''}
      />
      <CommonFields goals={goals} value={routine} />
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
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}
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
      <p className="muted">
        An end time at or before the start is on the following day.
      </p>
      <label className="check">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={routine?.enabled ?? true}
        />{' '}
        Enabled
      </label>
      {routine && (
        <>
          <label>
            Apply changes to
            <select name="scope" defaultValue="template">
              <option value="template">Only days not generated yet</option>
              <option value="future">
                Also eligible future generated blocks — preview first
              </option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" name="remove" /> Delete this recurring
            routine (preview before deleting)
          </label>
        </>
      )}
      <label className="check">
        <input type="checkbox" name="allowOverlap" /> Allow this overlap with
        other routines or dated blocks
      </label>
      <button className="button mt-3">
        {routine ? 'Save / preview routine' : 'Create routine'}
      </button>
    </ActionForm>
  );
}
export function GenerateForm({ day }: { day: string }) {
  return (
    <ActionForm action={generationAction} label="Generate plans">
      <div className="actions">
        <label>
          Starting date
          <input type="date" name="day" defaultValue={day} required />
        </label>
        <label>
          Generate
          <select name="count" defaultValue="1">
            <option value="1">One day</option>
            <option value="7">Next 7 days</option>
          </select>
        </label>
        <button className="button self-end mb-3">Generate plans</button>
      </div>
      <p className="muted">
        Choose {shiftDay(day, 1)} for tomorrow. Existing dated plans are
        preserved.
      </p>
    </ActionForm>
  );
}
export function ExecutionControls({ block }: { block: TimeBlock }) {
  return (
    <ActionForm action={executionAction} label={`Actions for ${block.title}`}>
      <input type="hidden" name="id" value={block.id} />
      <div className="actions">
        {['PLANNED', 'IN_PROGRESS'].includes(block.status) ? (
          <>
            <button
              className="button"
              name="action"
              value={block.status === 'IN_PROGRESS' ? 'stop' : 'start'}
            >
              {block.status === 'IN_PROGRESS' ? 'Stop session' : 'Start'}
            </button>
            <button className="button secondary" name="action" value="complete">
              Complete
            </button>
            <button className="button secondary" name="action" value="skip">
              Skip
            </button>
            <button className="button secondary" name="action" value="cancel">
              Cancel block
            </button>
          </>
        ) : (
          <button className="button secondary" name="action" value="reset">
            Reset to planned
          </button>
        )}
      </div>
      {['PLANNED', 'IN_PROGRESS'].includes(block.status) && (
        <label className="muted">
          Skip reason (optional)
          <input
            name="reason"
            maxLength={300}
            placeholder="e.g. Work ran late"
          />
        </label>
      )}
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
    <ActionForm
      action={manualAction}
      label={`Log actual time for ${block.title}`}
    >
      <input type="hidden" name="id" value={block.id} />
      <div className="form-grid">
        <label>
          Actual start date
          <input name="day" type="date" required defaultValue={day} />
        </label>
        <label>
          Actual start time
          <input
            name="startLocal"
            type="time"
            required
            defaultValue={formatInTimeZone(block.plannedStart, zone, 'HH:mm')}
          />
        </label>
        <label>
          Actual end date
          <input name="endDay" type="date" required defaultValue={day} />
        </label>
        <label>
          Actual end time
          <input
            name="endLocal"
            type="time"
            required
            defaultValue={formatInTimeZone(block.plannedEnd, zone, 'HH:mm')}
          />
        </label>
      </div>
      <label>
        Session notes
        <textarea name="notes" maxLength={1000} />
      </label>
      <p className="muted">
        {zone}. Actual entries cannot overlap another session or end in the
        future.
      </p>
      <button className="button mt-3">Save actual time</button>
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
    <ActionForm action={reviewAction} label="Daily review">
      <input type="hidden" name="day" value={day} />
      <label>
        What went well? (optional)
        <textarea
          name="notes"
          maxLength={1000}
          defaultValue={review?.notes ?? ''}
        />
      </label>
      <label>
        Main blocker (optional)
        <input
          name="blocker"
          maxLength={500}
          defaultValue={review?.blocker ?? ''}
        />
      </label>
      <label>
        Carry forward (optional)
        <input
          name="carryForward"
          maxLength={500}
          defaultValue={review?.carryForward ?? ''}
        />
      </label>
      <label>
        Overall day
        <select name="rating" defaultValue={review?.rating ?? ''}>
          <option value="">No rating</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option value={n} key={n}>
              {n} / 5
            </option>
          ))}
        </select>
      </label>
      <button className="button">Save daily review</button>
    </ActionForm>
  );
}
