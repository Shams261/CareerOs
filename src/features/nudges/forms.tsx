import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { categoryGroup } from '@/features/review/domain';
import { nudgePauseAction, nudgeSettingsAction } from './actions';
import {
  EVENING_LINES,
  MORNING_LINES,
  PAUSED_FOREVER,
  WEEKDAYS,
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
}: {
  setting: NudgeSetting;
  /** Category groups the owner plans with, plus the defaults. */
  categories: string[];
  today: string;
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
