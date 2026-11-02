'use client';
import { RumiPose } from './pose';
import { useState, useTransition } from 'react';
import { AGENT_NAME } from '@/features/agent/constants';
import { keepSummaryAction, weekSummaryAction } from './actions';

/**
 * Weekly review step one (WI-110): Rumi's two sentences on the week, on a press. The owner
 * edits them, then Keep puts them into What went well? as a draft, or Remove drops them.
 * Nothing is stored before Keep.
 */
export function WeekSummary({ monday }: { monday: string }) {
  const [text, setText] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;
  if (text === null)
    return (
      <div className="week-summary has-pose">
        <RumiPose pose="calendar" size={80} />
        <button
          type="button"
          className="button secondary small"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() =>
            start(async () => {
              setMessage(null);
              const r = await weekSummaryAction(monday);
              if (r.ok) setText(r.text);
              else setMessage(r.message);
            })
          }
        >
          {pending
            ? `${AGENT_NAME} is reading the week…`
            : `Sum up the week with ${AGENT_NAME}`}
        </button>
        {message && (
          <p className="form-message" role="alert">
            {message}
          </p>
        )}
      </div>
    );
  return (
    <div className="week-summary">
      <RumiPose pose="calendar" size={64} className="week-summary-pose" />
      <label htmlFor="week-summary-text" className="eyebrow">
        {AGENT_NAME} on this week
      </label>
      <textarea
        id="week-summary-text"
        rows={3}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="button small"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await keepSummaryAction(monday, text);
              setMessage(r.message);
            })
          }
        >
          Keep in What went well?
        </button>
        <button
          type="button"
          className="button secondary small"
          onClick={() => setGone(true)}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
