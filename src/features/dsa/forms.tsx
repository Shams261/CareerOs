'use client';
import { ActionForm } from '@/components/action-form';
import { FormMore } from '@/components/form-more';
import { closePanel } from '@/components/side-panel';
import { topicAction, problemAction, revisionAction } from './actions';
import type { DsaTopic, DsaProblem } from '@/generated/prisma/client';
import type { ActionState } from '@/features/schedule/actions';
import { Button } from '@/components/ui/button';
/** `compact` is the first-run form: a name, saved as the current topic. */
export function TopicForm({
  topic,
  currentId,
  compact = false,
}: {
  topic?: DsaTopic;
  currentId?: string;
  compact?: boolean;
}) {
  if (compact)
    return (
      <ActionForm action={topicAction} label="Add topic" className="dsa-form">
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="description" value="" />
        <input type="hidden" name="status" value="LEARNING" />
        <input type="hidden" name="ordering" value="0" />
        <input type="hidden" name="current" value="on" />
        <label>
          Topic
          <input name="name" required maxLength={100} placeholder="Arrays" />
        </label>
        <Button>Add topic</Button>
      </ActionForm>
    );
  return (
    <ActionForm
      action={topicAction}
      label={topic ? `Edit topic ${topic.name}` : 'Add topic'}
      className="dsa-form"
      resetOnSuccess={!topic}
    >
      <input type="hidden" name="id" value={topic?.id ?? ''} />
      <label>
        Name
        <input
          name="name"
          required
          maxLength={100}
          defaultValue={topic?.name}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          maxLength={1000}
          defaultValue={topic?.description ?? ''}
        />
      </label>
      <label>
        Status
        <select name="status" defaultValue={topic?.status ?? 'LEARNING'}>
          <option value="NOT_STARTED">Not started</option>
          <option value="LEARNING">Learning</option>
          <option value="NEEDS_REVISION">Revising</option>
          <option value="INTERVIEW_READY">Interview ready</option>
          <option value="COMPLETED">Completed</option>
          <option value="PAUSED">Paused</option>
        </select>
      </label>
      <label>
        Display order
        <input
          name="ordering"
          type="number"
          min="0"
          max="10000"
          defaultValue={topic?.ordering ?? 0}
        />
      </label>
      <label className="check">
        <input
          name="current"
          type="checkbox"
          defaultChecked={!!topic && currentId === topic.id}
        />
        Current topic
      </label>
      <Button>{topic ? 'Save topic' : 'Add topic'}</Button>
    </ActionForm>
  );
}
const LEVELS = [
  ['EASY', 'Easy'],
  ['MEDIUM', 'Medium'],
  ['HARD', 'Hard'],
] as const;
/**
 * Add or edit a problem (WI-093, the shape of Add a block): the title and the topic on one
 * line, the difficulty as chips, and the platform, the link and the notes under More. Opened
 * in a modal, it closes the modal once saved (`inPanel`).
 */
export function ProblemForm({
  problem,
  topics,
  currentId,
  inPanel = false,
}: {
  problem?: DsaProblem;
  topics: DsaTopic[];
  currentId?: string;
  inPanel?: boolean;
}) {
  return (
    <ActionForm
      action={problemAction}
      label={problem ? 'Edit problem' : 'Add problem'}
      className="dsa-form problem-form"
      resetOnSuccess={!problem}
      onSuccess={inPanel ? closePanel : undefined}
    >
      <input type="hidden" name="id" value={problem?.id ?? ''} />
      <div className="form-grid problem-form-line">
        <label>
          Title
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={problem?.title}
            autoFocus={inPanel}
          />
        </label>
        <label>
          Topic
          <select
            name="topicId"
            required
            defaultValue={problem?.topicId ?? currentId ?? ''}
          >
            <option value="" disabled>
              Choose a topic
            </option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="choice-group is-chips">
        <legend>Difficulty</legend>
        {LEVELS.map(([value, label]) => (
          <label key={value} className="choice">
            <input
              type="radio"
              name="difficulty"
              value={value}
              defaultChecked={(problem?.difficulty ?? 'MEDIUM') === value}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <FormMore defaultOpen={!!problem}>
        <label>
          Platform <span className="muted">(optional)</span>
          <input
            name="platform"
            maxLength={80}
            placeholder="LeetCode, HackerRank, a book…"
            defaultValue={problem?.platform}
          />
        </label>
        <label>
          Problem URL <span className="muted">(optional)</span>
          <input
            name="problemUrl"
            type="url"
            defaultValue={problem?.problemUrl}
          />
        </label>
        <label>
          Notes
          <textarea
            name="notes"
            maxLength={2000}
            defaultValue={problem?.notes ?? ''}
          />
        </label>
      </FormMore>
      <Button disabled={!topics.length}>
        {problem ? 'Save problem' : 'Add problem'}
      </Button>
      {!topics.length && <p className="muted">Add a topic first.</p>}
    </ActionForm>
  );
}
export function RevisionForm({
  problem,
  inPanel = false,
}: {
  problem: DsaProblem;
  inPanel?: boolean;
}) {
  return (
    <ActionForm
      action={revisionAction}
      label="Schedule revision"
      className="dsa-form"
      onSuccess={inPanel ? closePanel : undefined}
    >
      <input type="hidden" name="id" value={problem.id} />
      <label>
        Revision date
        <input
          name="date"
          type="date"
          required
          defaultValue={
            problem.nextRevisionAt
              ? new Date(problem.nextRevisionAt).toISOString().slice(0, 10)
              : ''
          }
        />
      </label>
      <Button>Save revision date</Button>
    </ActionForm>
  );
}
/** Hide (an imported problem) or Delete (the owner's own), asked once in a modal (WI-093). */
export function RemoveProblemForm({
  action,
  id,
  label,
  question,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  id: string;
  label: string;
  question: string;
}) {
  return (
    <ActionForm
      action={action}
      label={label}
      className="dsa-form"
      onSuccess={closePanel}
    >
      <input type="hidden" name="id" value={id} />
      <p>{question}</p>
      <Button variant="destructive">{label}</Button>
    </ActionForm>
  );
}
