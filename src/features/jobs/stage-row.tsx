'use client';
import { ActionForm } from '@/components/action-form';
import { stageAction } from './actions';
import { closedStages, label, pipelineStages, type Stage } from './domain';

/**
 * The application's stage as the pipeline (WI-096): one row of the stages, the ones passed
 * tinted, the current one filled, and "Move to" at its end, a select that saves on choice.
 * The answer and Undo show in the `stage` outlet under the row. Keyed by the stage by its
 * caller, so a result that moves the application remounts it with the new value.
 */
export function StageRow({
  id,
  stage,
  requestId,
}: {
  id: string;
  stage: Stage;
  /** Minted on the server so the hidden field matches between render and hydration. */
  requestId: string;
}) {
  const open = !closedStages.includes(stage);
  const at = pipelineStages.indexOf(stage);
  return (
    <ActionForm action={stageAction} className="stage-row" broadcast="stage">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="requestId" value={requestId} />
      <ol className="stage-pills" aria-label="Stage">
        {pipelineStages.map((s, i) => (
          <li
            key={s}
            className={`stage-pill${open && i < at ? ' is-done' : ''}${s === stage ? ' is-now' : ''}`}
            aria-current={s === stage ? 'step' : undefined}
          >
            {label(s)}
          </li>
        ))}
        {!open && (
          <li className="stage-pill is-now is-closed" aria-current="step">
            {label(stage)}
          </li>
        )}
      </ol>
      <label className="stage-move">
        <span className="sr-only">Move to</span>
        <select
          name="stage"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) e.target.form?.requestSubmit();
          }}
        >
          <option value="" disabled>
            Move to…
          </option>
          {[...pipelineStages, ...closedStages]
            .filter((s) => s !== stage)
            .map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
        </select>
      </label>
      <button
        type="submit"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        Move
      </button>
    </ActionForm>
  );
}
