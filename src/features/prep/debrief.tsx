'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AGENT_NAME } from '@/features/agent/constants';
import { debriefAction } from './actions';
import { DEBRIEF_QUESTIONS, type DebriefField } from './mock-domain';

/**
 * Debrief with Rumi (WI-108): three fixed questions, one at a time, answered in the owner's
 * words and saved on the round. No model reads or writes them.
 */
export function DebriefPanel({
  roundId,
  initial,
}: {
  roundId: string;
  initial: Record<DebriefField, string>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(initial);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const q = DEBRIEF_QUESTIONS[step];
  const last = step === DEBRIEF_QUESTIONS.length - 1;
  if (result?.ok)
    return (
      <p className="form-message is-success" role="status">
        {result.message}
      </p>
    );
  return (
    <form
      className="debrief"
      onSubmit={(e) => {
        e.preventDefault();
        if (!last) return setStep(step + 1);
        start(async () => {
          const r = await debriefAction(roundId, answers);
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <p className="eyebrow">
        {AGENT_NAME} asks · {step + 1} of {DEBRIEF_QUESTIONS.length}
      </p>
      <label className="debrief-question">
        <span>{q.ask}</span>
        <textarea
          key={q.field}
          rows={5}
          maxLength={2000}
          autoFocus
          value={answers[q.field]}
          onChange={(e) =>
            setAnswers((a) => ({ ...a, [q.field]: e.target.value }))
          }
        />
      </label>
      {result && !result.ok && (
        <p className="form-message" role="alert">
          {result.message}
        </p>
      )}
      <div className="actions">
        {step > 0 && (
          <button
            type="button"
            className="button secondary small"
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
        )}
        <button className="button small" disabled={pending}>
          {last ? (pending ? 'Saving…' : 'Save debrief') : 'Next'}
        </button>
      </div>
      <p className="prep-note">
        Saved on this interview in your words. {AGENT_NAME} never reads them
        back.
      </p>
    </form>
  );
}
