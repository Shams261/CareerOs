import { randomUUID } from 'node:crypto';
import { ActionForm } from '@/components/action-form';
import type {
  InterviewRound,
  JobApplication,
  NotificationPreference,
} from '@/generated/prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import {
  createApplicationAction,
  detailsAction,
  followUpAction,
  followUpDoneAction,
  jobNoteAction,
  jobReminderAction,
  prepAction,
  prepDoneAction,
  rescheduleAction,
  resultAction,
  roundAction,
  roundDetailsAction,
  stageAction,
} from './actions';
import {
  arrangements,
  calendarDate,
  interviewTypes,
  label,
  ownerLabel,
  owners,
  stages,
} from './domain';

const Options = ({ values }: { values: readonly string[] }) =>
  values.map((v) => (
    <option key={v} value={v}>
      {label(v)}
    </option>
  ));
const date = (d: Date | null | undefined) => (d ? calendarDate(d) : '');

export function QuickAddForm({ today }: { today: string }) {
  return (
    <ActionForm
      action={createApplicationAction}
      label="Add application"
      className="dsa-form"
      resetOnSuccess
    >
      <input type="hidden" name="requestId" value={randomUUID()} />
      <div className="form-grid">
        <label>
          Company
          <input name="company" required maxLength={120} />
        </label>
        <label>
          Role
          <input name="role" required maxLength={160} />
        </label>
        <label>
          Job URL (optional)
          <input name="jobUrl" type="url" placeholder="https://" />
        </label>
        <label>
          Source (optional)
          <input
            name="source"
            maxLength={80}
            list="job-sources"
            placeholder="LinkedIn, Referral…"
          />
        </label>
        <label>
          Applied date
          <input name="appliedAt" type="date" defaultValue={today} />
        </label>
        <label>
          Current stage
          <select name="stage" defaultValue="APPLIED">
            <Options values={stages} />
          </select>
        </label>
      </div>
      <datalist id="job-sources">
        {[
          'LinkedIn',
          'Company Website',
          'Recruiter',
          'Referral',
          'Indeed',
          'Wellfound',
          'Other',
        ].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <p className="muted">
        Saved roles have no applied date. Recruiter, interviews and notes can be
        added later.
      </p>
      <button className="button">Add application</button>
    </ActionForm>
  );
}

export function DetailsForm({ app }: { app: JobApplication }) {
  return (
    <ActionForm
      action={detailsAction}
      label="Edit details"
      className="dsa-form"
    >
      <input type="hidden" name="id" value={app.id} />
      <div className="form-grid">
        <label>
          Company
          <input name="company" required defaultValue={app.company} />
        </label>
        <label>
          Role
          <input name="role" required defaultValue={app.role} />
        </label>
        <label>
          Job URL
          <input name="jobUrl" type="url" defaultValue={app.jobUrl ?? ''} />
        </label>
        <label>
          Location
          <input name="location" defaultValue={app.location ?? ''} />
        </label>
        <label>
          Work arrangement
          <select name="workArrangement" defaultValue={app.workArrangement}>
            <Options values={arrangements} />
          </select>
        </label>
        <label>
          Employment type
          <input
            name="employmentType"
            placeholder="Full-time, Contract…"
            defaultValue={app.employmentType ?? ''}
          />
        </label>
        <label>
          Source
          <input name="source" defaultValue={app.source ?? ''} />
        </label>
        <label>
          Applied date
          <input
            name="appliedAt"
            type="date"
            defaultValue={date(app.appliedAt)}
          />
        </label>
        <label>
          Priority
          <select name="priority" defaultValue={String(app.priority)}>
            <option value="1">High</option>
            <option value="2">Normal</option>
            <option value="3">Low</option>
          </select>
        </label>
        <label>
          Recruiter
          <input name="recruiterName" defaultValue={app.recruiterName ?? ''} />
        </label>
        <label>
          Recruiter contact
          <input
            name="recruiterContact"
            placeholder="Email or phone"
            defaultValue={app.recruiterContact ?? ''}
          />
        </label>
        <label>
          Hiring manager / contact
          <input name="hiringContact" defaultValue={app.hiringContact ?? ''} />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" rows={4} defaultValue={app.notes ?? ''} />
      </label>
      <label>
        Offer / compensation notes
        <textarea
          name="compensationNotes"
          rows={3}
          placeholder="Base, bonus, equity, deadline"
          defaultValue={app.compensationNotes ?? ''}
        />
      </label>
      <label>
        Job description snapshot
        <textarea
          name="jobDescription"
          rows={5}
          defaultValue={app.jobDescription ?? ''}
        />
      </label>
      <button className="button">Save details</button>
    </ActionForm>
  );
}

export function StageForm({ app }: { app: JobApplication }) {
  return (
    <ActionForm
      action={stageAction}
      label="Change stage"
      className="dsa-form"
      resetOnSuccess
    >
      <input type="hidden" name="id" value={app.id} />
      <input type="hidden" name="requestId" value={randomUUID()} />
      <label>
        Move to stage
        <select name="stage" required defaultValue="">
          <option value="" disabled>
            Choose stage
          </option>
          {stages
            .filter((s) => s !== app.stage)
            .map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
        </select>
      </label>
      <label>
        Note (optional)
        <input
          name="note"
          maxLength={2000}
          placeholder="Recruiter reached out"
        />
      </label>
      <button className="button">Change stage</button>
    </ActionForm>
  );
}

function FollowUpFields({ app }: { app?: JobApplication }) {
  return (
    <div className="form-grid">
      <label>
        Next action
        <input
          name="nextAction"
          maxLength={200}
          placeholder="Follow up with recruiter"
          defaultValue={app?.nextAction ?? ''}
        />
      </label>
      <label>
        Due date
        <input
          name="nextActionDate"
          type="date"
          defaultValue={date(app?.nextActionDate)}
        />
      </label>
      <label>
        Who acts next?
        <select name="actionOwner" defaultValue={app?.actionOwner ?? 'ME'}>
          {owners.map((o) => (
            <option key={o} value={o}>
              {ownerLabel(o)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
export function FollowUpForm({ app }: { app: JobApplication }) {
  return (
    <ActionForm
      action={followUpAction}
      label="Edit next action"
      className="dsa-form"
    >
      <input type="hidden" name="id" value={app.id} />
      <FollowUpFields app={app} />
      <button className="button">Save next action</button>
    </ActionForm>
  );
}
export function FollowUpDoneForm({ app }: { app: JobApplication }) {
  return (
    <ActionForm
      action={followUpDoneAction}
      label="Complete next action"
      className="dsa-form"
      resetOnSuccess
    >
      <input type="hidden" name="id" value={app.id} />
      <input type="hidden" name="requestId" value={randomUUID()} />
      <label>
        What happened? (optional)
        <input
          name="note"
          maxLength={2000}
          placeholder="Sent follow-up email"
        />
      </label>
      <p className="muted">Then set what comes next (leave blank for none).</p>
      <FollowUpFields />
      <button className="button">Mark done</button>
    </ActionForm>
  );
}

/** Render once per page; interview time inputs reference it. */
export const ZoneOptions = () => (
  <datalist id="zones">
    {[
      'America/Toronto',
      'America/Vancouver',
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Asia/Kolkata',
      'UTC',
    ].map((v) => (
      <option key={v} value={v} />
    ))}
  </datalist>
);
function WhenFields({ zone, round }: { zone: string; round?: InterviewRound }) {
  const z = round?.timezone ?? zone;
  return (
    <div className="form-grid">
      <label>
        Date
        <input
          name="date"
          type="date"
          required
          defaultValue={
            round ? formatInTimeZone(round.scheduledStart, z, 'yyyy-MM-dd') : ''
          }
        />
      </label>
      <label>
        Start
        <input
          name="start"
          type="time"
          required
          defaultValue={
            round ? formatInTimeZone(round.scheduledStart, z, 'HH:mm') : ''
          }
        />
      </label>
      <label>
        End (optional)
        <input
          name="end"
          type="time"
          defaultValue={
            round?.scheduledEnd
              ? formatInTimeZone(round.scheduledEnd, z, 'HH:mm')
              : ''
          }
        />
      </label>
      <label>
        Interview timezone
        <input name="timezone" required defaultValue={z} list="zones" />
      </label>
    </div>
  );
}
export function RoundForm({
  applicationId,
  zone,
}: {
  applicationId: string;
  zone: string;
}) {
  return (
    <ActionForm
      action={roundAction}
      label="Add interview"
      className="dsa-form"
      resetOnSuccess
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="requestId" value={randomUUID()} />
      <div className="form-grid">
        <label>
          Title
          <input
            name="title"
            required
            maxLength={120}
            placeholder="Coding round 1"
          />
        </label>
        <label>
          Type
          <select name="type" defaultValue="CODING">
            <Options values={interviewTypes} />
          </select>
        </label>
      </div>
      <WhenFields zone={zone} />
      <div className="form-grid">
        <label>
          Interviewers (optional)
          <input name="interviewers" maxLength={300} />
        </label>
        <label>
          Meeting URL (optional)
          <input name="meetingUrl" type="url" placeholder="https://" />
        </label>
        <label>
          Location (optional)
          <input name="location" maxLength={200} />
        </label>
      </div>
      <label>
        Notes (optional)
        <textarea name="notes" rows={2} maxLength={4000} />
      </label>
      <button className="button">Schedule interview</button>
    </ActionForm>
  );
}
export function RoundDetailsForm({ round }: { round: InterviewRound }) {
  return (
    <ActionForm
      action={roundDetailsAction}
      label="Edit interview"
      className="dsa-form"
    >
      <input type="hidden" name="id" value={round.id} />
      <div className="form-grid">
        <label>
          Title
          <input name="title" required defaultValue={round.title} />
        </label>
        <label>
          Type
          <select name="type" defaultValue={round.type}>
            <Options values={interviewTypes} />
          </select>
        </label>
        <label>
          Interviewers
          <input name="interviewers" defaultValue={round.interviewers ?? ''} />
        </label>
        <label>
          Meeting URL
          <input
            name="meetingUrl"
            type="url"
            defaultValue={round.meetingUrl ?? ''}
          />
        </label>
        <label>
          Location
          <input name="location" defaultValue={round.location ?? ''} />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" rows={2} defaultValue={round.notes ?? ''} />
      </label>
      <button className="button">Save interview</button>
    </ActionForm>
  );
}
export function RescheduleForm({ round }: { round: InterviewRound }) {
  return (
    <ActionForm
      action={rescheduleAction}
      label="Reschedule interview"
      className="dsa-form"
    >
      <input type="hidden" name="id" value={round.id} />
      <input type="hidden" name="requestId" value={randomUUID()} />
      <WhenFields zone={round.timezone} round={round} />
      <label>
        Reason (optional)
        <input
          name="note"
          maxLength={1000}
          placeholder="Interviewer unavailable"
        />
      </label>
      <button className="button">Reschedule</button>
    </ActionForm>
  );
}
export function ResultForm({
  round,
  stage,
}: {
  round: InterviewRound;
  stage: string;
}) {
  const completed = round.status === 'COMPLETED';
  return (
    <ActionForm
      action={resultAction}
      label="Log interview result"
      className="dsa-form"
    >
      <input type="hidden" name="id" value={round.id} />
      <input type="hidden" name="requestId" value={randomUUID()} />
      {completed ? (
        <input type="hidden" name="status" value="COMPLETED" />
      ) : (
        <label>
          Result
          <select name="status" defaultValue="COMPLETED">
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="NO_SHOW">No-show</option>
          </select>
        </label>
      )}
      <label>
        How did it go? (optional)
        <textarea
          name="outcomeNotes"
          rows={2}
          maxLength={4000}
          defaultValue={round.outcomeNotes ?? ''}
        />
      </label>
      <div className="form-grid">
        <label>
          Topics asked
          <textarea
            name="topicsAsked"
            rows={2}
            maxLength={2000}
            defaultValue={round.topicsAsked ?? ''}
          />
        </label>
        <label>
          What went well
          <textarea
            name="wentWell"
            rows={2}
            maxLength={2000}
            defaultValue={round.wentWell ?? ''}
          />
        </label>
        <label>
          What to improve
          <textarea
            name="toImprove"
            rows={2}
            maxLength={2000}
            defaultValue={round.toImprove ?? ''}
          />
        </label>
        {!completed && (
          <label>
            Also move application to (optional)
            <select name="stage" defaultValue="">
              <option value="">Keep {label(stage)}</option>
              {stages
                .filter((s) => s !== stage)
                .map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <p className="muted">
        Your reflection only. Nothing here changes learning mastery or DSA
        attempts.
      </p>
      <button className="button">
        {completed ? 'Save reflection' : 'Save result'}
      </button>
    </ActionForm>
  );
}
export type LinkOption = { value: string; label: string };
export function PrepForm({
  roundId,
  kind,
  links,
}: {
  roundId: string;
  kind: 'PREP' | 'GAP';
  links: LinkOption[];
}) {
  return (
    <ActionForm
      action={prepAction}
      label={kind === 'GAP' ? 'Add weak area' : 'Add prep item'}
      className="dsa-form"
      resetOnSuccess
    >
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="form-grid">
        <label>
          {kind === 'GAP' ? 'Weak area' : 'Prep item'}
          <input
            name="title"
            required
            maxLength={200}
            placeholder={
              kind === 'GAP'
                ? 'Explaining isolation levels'
                : 'Review rate limiting'
            }
          />
        </label>
        <label>
          Link (optional)
          <select name="link" defaultValue="">
            <option value="">Free text only</option>
            {links.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="button secondary">
        {kind === 'GAP' ? 'Add weak area' : 'Add prep item'}
      </button>
    </ActionForm>
  );
}
export function PrepToggle({
  id,
  completed,
  title,
}: {
  id: string;
  completed: boolean;
  title: string;
}) {
  return (
    <ActionForm action={prepDoneAction} label={`Toggle ${title}`}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="completed" value={String(!completed)} />
      <button className="button secondary">
        {completed ? 'Reopen' : 'Mark done'}
      </button>
    </ActionForm>
  );
}
export function NoteForm({ id }: { id: string }) {
  return (
    <ActionForm
      action={jobNoteAction}
      label="Add timeline note"
      className="dsa-form"
      resetOnSuccess
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="requestId" value={randomUUID()} />
      <label>
        Timeline note
        <textarea name="note" rows={2} required maxLength={4000} />
      </label>
      <button className="button secondary">Add note</button>
    </ActionForm>
  );
}
export function JobReminderForm({
  followUp,
  interview,
}: {
  followUp: NotificationPreference | null;
  interview: NotificationPreference | null;
}) {
  return (
    <ActionForm
      action={jobReminderAction}
      label="Job reminders"
      className="dsa-form"
    >
      <label className="check">
        <input
          type="checkbox"
          name="followUpEnabled"
          defaultChecked={followUp?.enabled ?? false}
        />
        Follow-up reminder (once per planned date)
      </label>
      <label>
        Follow-up reminder time
        <input
          name="followUpTime"
          type="time"
          required
          defaultValue={followUp?.preferredTime ?? '09:00'}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          name="interviewEnabled"
          defaultChecked={interview?.enabled ?? false}
        />
        Interview reminders (about 24 hours before, and shortly before)
      </label>
      <label>
        Short reminder (minutes before)
        <input
          name="interviewOffset"
          type="number"
          min="10"
          max="240"
          required
          defaultValue={interview?.offsetMinutes ?? 60}
        />
      </label>
      <p className="muted">
        In-app inbox reminders created by the deployment scheduler. No
        closed-app push or email.
      </p>
      <button className="button">Save job reminders</button>
    </ActionForm>
  );
}
