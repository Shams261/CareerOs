import { randomUUID } from 'node:crypto';
import { ActionForm } from '@/components/action-form';
import type {
  LearningSubject,
  LearningTopic,
  NotificationPreference,
} from '@/generated/prisma/client';
import {
  subjectAction,
  learningTopicAction,
  activityAction,
  reviewAction,
  resourceAction,
  learningReminderAction,
} from './actions';
import {
  dimensions,
  scoreNames,
  statuses,
  statusLabel,
  calendarDate,
} from './domain';
/** `compact` is the first-run form: a name, saved as the active current focus. */
export function SubjectForm({
  subject,
  currentId,
  goals,
  compact = false,
}: {
  subject?: LearningSubject;
  currentId: string | null;
  goals: { id: string; title: string }[];
  compact?: boolean;
}) {
  if (compact)
    return (
      <ActionForm
        action={subjectAction}
        label="Add subject"
        className="dsa-form"
      >
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="description" value="" />
        <input type="hidden" name="status" value="ACTIVE" />
        <input type="hidden" name="ordering" value="0" />
        <input type="hidden" name="goalId" value="" />
        <input type="hidden" name="current" value="on" />
        <label>
          Subject
          <input
            name="name"
            required
            maxLength={100}
            placeholder="System design"
          />
        </label>
        <button className="button">Add subject</button>
      </ActionForm>
    );
  return (
    <ActionForm
      action={subjectAction}
      label={subject ? 'Edit subject' : 'Add subject'}
      className="dsa-form"
      resetOnSuccess={!subject}
    >
      <input type="hidden" name="id" value={subject?.id ?? ''} />
      <label>
        Name
        <input
          name="name"
          required
          maxLength={100}
          defaultValue={subject?.name}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          maxLength={2000}
          defaultValue={subject?.description ?? ''}
        />
      </label>
      <label>
        Status
        <select name="status" defaultValue={subject?.status ?? 'ACTIVE'}>
          {['NOT_STARTED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'].map(
            (s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Display order
        <input
          name="ordering"
          type="number"
          min="0"
          max="10000"
          defaultValue={subject?.ordering ?? 0}
        />
      </label>
      <label>
        Goal
        <select name="goalId" defaultValue={subject?.goalId ?? ''}>
          <option value="">Independent learning</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          name="current"
          defaultChecked={!!subject && subject.id === currentId}
        />
        Current focus (active subjects only)
      </label>
      <button className="button">
        {subject ? 'Save subject' : 'Add subject'}
      </button>
    </ActionForm>
  );
}
export function LearningTopicForm({
  topic,
  subjectId,
  topics,
}: {
  topic?: LearningTopic;
  subjectId: string;
  topics: LearningTopic[];
}) {
  return (
    <ActionForm
      action={learningTopicAction}
      label={topic ? 'Edit topic' : 'Add topic'}
      className="dsa-form"
      resetOnSuccess={!topic}
    >
      <input type="hidden" name="id" value={topic?.id ?? ''} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <label>
        Title
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={topic?.title}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          maxLength={2000}
          defaultValue={topic?.description ?? ''}
        />
      </label>
      <label>
        Status
        <select name="status" defaultValue={topic?.status ?? 'NOT_STARTED'}>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Learning order
        <input
          type="number"
          name="ordering"
          min="0"
          max="10000"
          defaultValue={topic?.ordering ?? 0}
        />
      </label>
      <label>
        Parent topic
        <select name="parentId" defaultValue={topic?.parentId ?? ''}>
          <option value="">Top-level topic</option>
          {topics
            .filter((t) => !t.parentId && t.id !== topic?.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </select>
      </label>
      <label>
        Notes
        <textarea
          name="notes"
          rows={6}
          maxLength={8000}
          defaultValue={topic?.notes ?? ''}
        />
      </label>
      <button className="button">{topic ? 'Save topic' : 'Add topic'}</button>
    </ActionForm>
  );
}
export function ActivityForm({ topicId }: { topicId: string }) {
  const nonce = randomUUID();
  return (
    <ActionForm
      action={activityAction}
      label="Record activity"
      className="dsa-form"
      resetOnSuccess
    >
      <input type="hidden" name="topicId" value={topicId} />
      <input type="hidden" name="requestId" value={nonce} />
      <label>
        Activity
        <select name="activityType" defaultValue="REVIEW">
          {[
            'LEARN',
            'REVIEW',
            'PRACTICE',
            'INTERVIEW_RECALL',
            'MOCK',
            'NOTE',
          ].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        {dimensions.map((d) => (
          <label key={d}>
            {d[0].toUpperCase() + d.slice(1)}
            <select name={d} defaultValue="">
              <option value="">Keep current assessment</option>
              {scoreNames.map((s, i) => (
                <option key={s} value={i}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label>
        Time spent (minutes, optional)
        <input name="durationMinutes" type="number" min="1" max="1440" />
      </label>
      <label>
        What happened or felt difficult?
        <textarea name="notes" maxLength={4000} />
      </label>
      <button className="button">Save activity</button>
    </ActionForm>
  );
}
export function ReviewForm({ topic }: { topic: LearningTopic }) {
  return (
    <ActionForm
      action={reviewAction}
      label="Schedule review"
      className="dsa-form"
    >
      <input type="hidden" name="id" value={topic.id} />
      <label>
        Review date
        <input
          type="date"
          name="date"
          required
          defaultValue={
            topic.nextReviewDate ? calendarDate(topic.nextReviewDate) : ''
          }
        />
      </label>
      <button className="button">Save review date</button>
    </ActionForm>
  );
}
export function LearningResourceForm({ topicId }: { topicId: string }) {
  return (
    <ActionForm
      action={resourceAction}
      label="Add resource"
      className="dsa-form"
    >
      <input type="hidden" name="topicId" value={topicId} />
      <label>
        Resource title
        <input name="title" required maxLength={200} />
      </label>
      <label>
        URL
        <input name="url" type="url" required />
      </label>
      <label>
        Type
        <select name="type" defaultValue="DOCUMENTATION">
          {[
            'DOCUMENTATION',
            'ARTICLE',
            'VIDEO',
            'COURSE',
            'REPOSITORY',
            'OTHER',
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Resource note
        <textarea name="notes" maxLength={2000} />
      </label>
      <button className="button">Save resource</button>
    </ActionForm>
  );
}
export function LearningReminderForm({
  pref,
}: {
  pref: NotificationPreference | null;
}) {
  return (
    <ActionForm
      action={learningReminderAction}
      label="Learning reminder"
      className="dsa-form"
    >
      <label className="check">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={pref?.enabled ?? false}
        />
        Remind me when roadmap items or topics are due for revision
      </label>
      <label>
        Time
        <input
          name="preferredTime"
          type="time"
          required
          defaultValue={pref?.preferredTime ?? '18:00'}
        />
      </label>
      <button className="button secondary">Save</button>
    </ActionForm>
  );
}
