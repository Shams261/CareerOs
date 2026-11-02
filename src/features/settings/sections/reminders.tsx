import { Bell } from 'lucide-react';
import { reminderAction } from '@/server/actions';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { SidePanel } from '@/components/side-panel';
import { PushControls } from '@/features/push/controls';
import { LearningReminderForm } from '@/features/learning/forms';
import { JobReminderForm } from '@/features/jobs/forms';
import { SettingRow } from '../rows';
import { NudgeSettingsForm } from '@/features/nudges/forms';
import { nudgeContext } from '@/features/nudges/domain';
import { readLineLanguage } from '@/features/nudges/domain';
import { reminderContext } from '../domain';
import type { SettingsView } from '../page-data';

/** Reminders: this device, Study nudges and the four reminders, each with its panel. */
export function RemindersGroup({ v }: { v: SettingsView }) {
  const {
    today,
    push,
    devices,
    routineCategories,
    ai,
    agent,
    lines,
    nudges,
    nudgesPaused,
    pref,
    revisionPref,
    followUpPref,
    interviewPref,
    sent,
  } = v;
  return (
    <section
      id="reminders"
      className="settings-group"
      aria-labelledby="notifications-heading"
    >
      <div className="agenda-head">
        <h2 id="notifications-heading" className="agenda-heading">
          Reminders
        </h2>
        <span className="muted">
          {devices
            ? `${devices} device${devices === 1 ? '' : 's'} enabled`
            : 'No device enabled yet'}
        </span>
      </div>
      <div className="settings-device">
        {push ? (
          <PushControls publicKey={push.publicKey} devices={devices} />
        ) : (
          <p className="status-line">
            <span>
              Push is not configured on this server; reminders stay on Today.
            </span>
          </p>
        )}
      </div>
      <ul className="plain-list attention-list">
        <SettingRow
          source="notification"
          icon={<Bell size={22} />}
          label="Study nudges"
          title="A morning plan, a block-start nudge and an evening check-in"
          context={`${nudgeContext(nudges)}${nudgesPaused ? ' · Paused' : ''}${sent(['STUDY_MORNING', 'STUDY_MIDDAY', 'STUDY_EVENING', 'STUDY_BLOCK'])}`}
          panel="reminder-study"
        />
        <SettingRow
          source="notification"
          icon={<Bell size={22} />}
          label="Daily"
          title="Remind me to review my day"
          context={`${reminderContext(pref, { time: '21:30' })}${sent(['DAILY_PROGRESS'])}`}
          panel="reminder-daily"
        />
        <SettingRow
          source="notification"
          icon={<Bell size={22} />}
          label="Revision"
          title="Roadmap items and topics due for revision"
          context={`${reminderContext(revisionPref, { time: '18:00' })}${sent(['TECHNICAL_REVIEW', 'DSA_REVISION'])}`}
          panel="reminder-revision"
        />
        <SettingRow
          source="notification"
          icon={<Bell size={22} />}
          label="Job follow-up"
          title="Follow-ups on their planned date"
          context={`${reminderContext(followUpPref, { time: '09:00' })}${sent(['JOB_FOLLOW_UP'])}`}
          panel="reminder-jobs"
          focus="follow-up"
        />
        <SettingRow
          source="notification"
          icon={<Bell size={22} />}
          label="Interview"
          title="About 24 hours before, and shortly before"
          context={`${reminderContext(interviewPref, { offset: 60 })}${sent(['INTERVIEW'])}`}
          panel="reminder-jobs"
          focus="interview"
        />
      </ul>
      <SidePanel id="reminder-study" title="Study nudges">
        <p className="status-line">
          <span>
            Off by default · a morning line and an evening check-in, four hours
            apart, plus one block-start nudge a day · never during a focus
            session · the lock screen never names a task
          </span>
        </p>
        <NudgeSettingsForm
          setting={nudges}
          categories={routineCategories.map((r) => r.category)}
          today={today}
          rumi={
            ai.configured
              ? {
                  language: readLineLanguage(agent.lineLanguage),
                  stats: lines,
                }
              : null
          }
        />
        <div className="panel-section">
          <h3>This device</h3>
          {push ? (
            <PushControls publicKey={push.publicKey} devices={devices} />
          ) : (
            <p className="muted">
              Push is not configured on this server. Nudges appear on Today.
            </p>
          )}
          <p className="status-line">
            <span>
              Without notifications, nudges stay on Today · iPhone needs Silsila
              on the Home Screen (iOS 16.4+)
            </span>
          </p>
        </div>
      </SidePanel>
      <SidePanel id="reminder-daily" title="Daily reminder">
        <ActionForm
          action={reminderAction}
          label="Daily reminder"
          className="dsa-form"
          closeOnSuccess
        >
          <label className="check">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={pref?.enabled ?? false}
            />
            Remind me to review my day
          </label>
          <label>
            Time
            <input
              required
              type="time"
              name="preferredTime"
              defaultValue={pref?.preferredTime ?? '21:30'}
            />
          </label>
          <Button>Save</Button>
        </ActionForm>
      </SidePanel>
      <SidePanel id="reminder-revision" title="Revision reminder">
        <LearningReminderForm pref={revisionPref} />
      </SidePanel>
      <SidePanel id="reminder-jobs" title="Job reminders">
        <JobReminderForm followUp={followUpPref} interview={interviewPref} />
      </SidePanel>
    </section>
  );
}
