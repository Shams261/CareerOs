import { ActionForm } from '@/components/action-form';
import { topicAction, problemAction, revisionAction } from './actions';
import type { DsaTopic, DsaProblem } from '@/generated/prisma/client';
import { revisionDay } from './domain';
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
        <button className="button">Add topic</button>
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
      <button className="button">{topic ? 'Save topic' : 'Add topic'}</button>
    </ActionForm>
  );
}
export function ProblemForm({
  problem,
  topics,
  currentId,
}: {
  problem?: DsaProblem;
  topics: DsaTopic[];
  currentId?: string;
}) {
  return (
    <ActionForm
      action={problemAction}
      label={problem ? 'Edit problem' : 'Add problem'}
      className="dsa-form"
    >
      <input type="hidden" name="id" value={problem?.id ?? ''} />
      <label>
        Title
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={problem?.title}
        />
      </label>
      <label>
        Platform
        <input
          name="platform"
          required
          maxLength={80}
          placeholder="LeetCode, HackerRank, custom…"
          defaultValue={problem?.platform}
        />
      </label>
      <label>
        Problem URL
        <input
          name="problemUrl"
          type="url"
          required
          defaultValue={problem?.problemUrl}
        />
      </label>
      <label>
        Difficulty
        <select
          name="difficulty"
          defaultValue={problem?.difficulty ?? 'MEDIUM'}
        >
          <option>EASY</option>
          <option>MEDIUM</option>
          <option>HARD</option>
        </select>
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
      <label>
        Notes
        <textarea
          name="notes"
          maxLength={2000}
          defaultValue={problem?.notes ?? ''}
        />
      </label>
      <button className="button" disabled={!topics.length}>
        {problem ? 'Save problem' : 'Add problem'}
      </button>
      {!topics.length && <p className="muted">Add a topic first.</p>}
    </ActionForm>
  );
}
export function RevisionForm({ problem }: { problem: DsaProblem }) {
  return (
    <ActionForm
      action={revisionAction}
      label="Schedule revision"
      className="dsa-form"
    >
      <input type="hidden" name="id" value={problem.id} />
      <label>
        Revision date
        <input
          name="date"
          type="date"
          required
          defaultValue={
            problem.nextRevisionAt ? revisionDay(problem.nextRevisionAt) : ''
          }
        />
      </label>
      <button className="button">Save revision date</button>
    </ActionForm>
  );
}
