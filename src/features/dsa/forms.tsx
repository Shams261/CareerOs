import { randomUUID } from 'node:crypto';
import { ActionForm } from '@/components/action-form';
import {
  topicAction,
  problemAction,
  attemptAction,
  revisionAction,
} from './actions';
import type { DsaTopic, DsaProblem } from '@/generated/prisma/client';
import { revisionDay } from './domain';
export function TopicForm({
  topic,
  currentId,
}: {
  topic?: DsaTopic;
  currentId?: string;
}) {
  return (
    <ActionForm
      action={topicAction}
      label={topic ? `Edit topic ${topic.name}` : 'Add topic'}
      className="dsa-form"
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
      <p className="muted">
        Choose Learning or Revising for your current focus. Uncheck Current
        topic to clear it.
      </p>
      <button className="button">Save topic</button>
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
        Save problem
      </button>
      {!topics.length && <p className="muted">Add a topic first.</p>}
    </ActionForm>
  );
}
export function AttemptForm({ problemId }: { problemId: string }) {
  const requestId = randomUUID();
  return (
    <ActionForm
      key={requestId}
      action={attemptAction}
      label="Record attempt"
      className="dsa-form"
    >
      <input type="hidden" name="problemId" value={problemId} />
      <input type="hidden" name="requestId" value={requestId} />
      <label>
        Solved independently?
        <select name="solvedIndependently" required defaultValue="">
          <option value="" disabled>
            Choose
          </option>
          <option value="YES">YES — independently</option>
          <option value="PARTIAL">PARTIAL — needed help</option>
          <option value="NO">NO — needed the approach</option>
        </select>
      </label>
      <label>
        Confidence after attempt
        <select name="confidenceAfter" required defaultValue="">
          <option value="" disabled>
            Choose
          </option>
          <option value="RED">RED — cannot derive the approach</option>
          <option value="YELLOW">YELLOW — understand, not yet reliable</option>
          <option value="GREEN">GREEN — independent and can explain</option>
        </select>
      </label>
      <p className="muted">
        YES allows Yellow or Green. PARTIAL / NO allows Red or Yellow.
        Completing a timer never changes confidence.
      </p>
      <label>
        Time spent (minutes, optional)
        <input name="durationMinutes" type="number" min="1" max="1440" />
      </label>
      <label>
        What did you miss? (optional)
        <textarea
          name="mistake"
          maxLength={1000}
          placeholder="Pattern, edge case, or implementation mistake"
        />
      </label>
      <label>
        Note (optional)
        <textarea name="notes" maxLength={2000} />
      </label>
      <button className="button">Save attempt</button>
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
      <button className="button">Schedule revision</button>
    </ActionForm>
  );
}
