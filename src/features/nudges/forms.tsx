import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { categoryGroup } from '@/features/review/domain';
import {
  nudgePauseAction,
  nudgeSettingsAction,
  resumePartAction,
} from './actions';
import { AGENT_NAME } from '@/features/agent/domain';
import {
  BLOCK_START_OFFSETS,
  EVENING_LINES,
  LINE_LANGUAGES,
  MORNING_LINES,
  PAUSED_FOREVER,
  WEEKDAYS,
  type LineLanguage,
  type NudgeSetting,
} from './domain';

/**
 * Settings → Study nudges (WI-028): both modes off until switched on here. The copy the owner
 * will see is shown as it will read; nothing is written by a model.
 */
export function NudgeSettingsForm({
  setting,
  categories,
  today,
  rumi = null,
}: {
  setting: NudgeSetting;
  /** Category groups the owner plans with, plus the defaults. */
  categories: string[];
  today: string;
  /** WI-101: shown only where AI is configured; the lines' language and the last days' count. */
  rumi?: {
    language: LineLanguage;
    stats: { written: number; total: number };
  } | null;
}) {
  const groups = [
    ...new Set([
      ...setting.studyCategories,
      'DSA',
      'Technical',
      ...categories.map(categoryGroup),
    ]),
  ];
  const paused = setting.pausedUntil && setting.pausedUntil >= today;
  return (
    <>
      <ActionForm
        action={nudgeSettingsAction}
        label="Study nudges"
        className="dsa-form nudge-form"
        closeOnSuccess
      >
        <fieldset className="nudge-mode">
          <legend>Morning encouragement</legend>
          <label className="check">
            <input
              type="checkbox"
              name="morningEnabled"
              defaultChecked={setting.morningEnabled}
            />
            Send a morning line on study days
          </label>
          <label>
            Time
            <input
              required
              type="time"
              name="morningTime"
              defaultValue={setting.morningTime}
            />
          </label>
          <p className="nudge-copy">“{MORNING_LINES[0]}”</p>
        </fieldset>
        <fieldset className="nudge-mode">
          <legend>When a study block starts</legend>
          <label className="check">
            <input
              type="checkbox"
              name="blockStartEnabled"
              defaultChecked={setting.blockStartEnabled}
            />
            Nudge once if nothing has begun
          </label>
          <label>
            After
            <select
              name="blockStartMinutes"
              defaultValue={String(setting.blockStartMinutes)}
            >
              {BLOCK_START_OFFSETS.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </label>
          <p className="nudge-copy">
            “18:00–19:30 DSA practice started 15 minutes ago and no session has
            begun yet. 75 minutes of it are left.”
          </p>
        </fieldset>
        <fieldset className="nudge-mode">
          <legend>Evening check-in</legend>
          <label className="check">
            <input
              type="checkbox"
              name="eveningEnabled"
              defaultChecked={setting.eveningEnabled}
            />
            Only when a study block passed and no session is recorded
          </label>
          <label>
            Not before
            <input
              required
              type="time"
              name="eveningTime"
              defaultValue={setting.eveningTime}
            />
          </label>
          <p className="nudge-copy">“{EVENING_LINES[0]}”</p>
        </fieldset>
        {rumi && (
          <fieldset className="nudge-mode">
            <legend>{AGENT_NAME} writes the lines</legend>
            <label className="check">
              <input
                type="checkbox"
                name="rumiLines"
                defaultChecked={setting.rumiLines}
              />
              One line from today’s records in the morning, the afternoon and
              the evening; the fixed lines stay as the fallback
            </label>
            <label>
              Language
              <select name="lineLanguage" defaultValue={rumi.language}>
                {LINE_LANGUAGES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="middayEnabled"
                defaultChecked={setting.middayEnabled}
              />
              An afternoon line while a study block is still ahead
            </label>
            <label>
              Afternoon time
              <input
                type="time"
                name="middayTime"
                defaultValue={setting.middayTime}
              />
            </label>
            <p className="nudge-copy">
              {rumi.stats.total
                ? `${AGENT_NAME} wrote ${rumi.stats.written} of ${rumi.stats.total} ${rumi.stats.total === 1 ? 'line' : 'lines'} in the last 14 days; the rest were the fixed lines.`
                : `Numbers in a line come only from your records; a line that fails the checks is replaced by the fixed line.`}
            </p>
          </fieldset>
        )}
        <label className="check">
          <input
            type="checkbox"
            name="learnTimes"
            defaultChecked={setting.learnTimes ?? true}
          />
          Let the times follow when I start (15 minutes at most a week; three
          “Too many” in a row turns a line off)
        </label>
        {setting.learnedNote && (
          <p className="nudge-copy">Last change: {setting.learnedNote}.</p>
        )}
        <fieldset className="nudge-days">
          <legend>Days</legend>
          {WEEKDAYS.map(([name, bit]) => (
            <label className="check" key={name}>
              <input
                type="checkbox"
                name="days"
                value={bit}
                defaultChecked={(setting.days & bit) !== 0}
              />
              {name}
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input
            type="checkbox"
            name="onlyStudyDays"
            defaultChecked={setting.onlyStudyDays}
          />
          Mornings only on days with a study block
        </label>
        <fieldset className="nudge-days">
          <legend>Study categories</legend>
          {groups.map((g) => (
            <label className="check" key={g}>
              <input
                type="checkbox"
                name="studyCategories"
                value={g}
                defaultChecked={setting.studyCategories.includes(g)}
              />
              {g}
            </label>
          ))}
        </fieldset>
        <div className="nudge-quiet">
          <label>
            Quiet from
            <input
              required
              type="time"
              name="quietStart"
              defaultValue={setting.quietStart}
            />
          </label>
          <label>
            until
            <input
              required
              type="time"
              name="quietEnd"
              defaultValue={setting.quietEnd}
            />
          </label>
        </div>
        <Button>Save</Button>
      </ActionForm>
      {(setting.pausedByFeedback ?? []).map((part) => (
        <ActionForm
          key={part}
          action={resumePartAction}
          label={`Resume the ${part} line`}
          className="nudge-pause"
        >
          <input type="hidden" name="part" value={part} />
          <p className="muted">
            {part === 'midday'
              ? 'Afternoon'
              : part[0].toUpperCase() + part.slice(1)}{' '}
            line paused by your feedback
          </p>
          <Button className="secondary small">Resume</Button>
        </ActionForm>
      ))}
      <ActionForm
        action={nudgePauseAction}
        label="Pause study nudges"
        className="nudge-pause"
      >
        <p className="muted">
          {paused
            ? setting.pausedUntil === PAUSED_FOREVER
              ? 'Paused until you turn them on.'
              : `Paused through ${setting.pausedUntil}.`
            : 'Pause'}
        </p>
        <div className="actions">
          {paused ? (
            <Button className="secondary small" name="pause" value="resume">
              Resume
            </Button>
          ) : (
            <>
              <Button className="secondary small" name="pause" value="week">
                This week
              </Button>
              <Button className="secondary small" name="pause" value="forever">
                Until I turn it on
              </Button>
            </>
          )}
        </div>
      </ActionForm>
    </>
  );
}
