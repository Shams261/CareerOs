'use client';
import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { AGENT_NAME } from '@/features/agent/constants';
import {
  ListenLine,
  MicButton,
  useCanDictate,
  type VoiceState,
} from '@/features/agent/voice';
import { useDictation } from '@/lib/speech';
import { dictationError, SILENCE_MS } from '@/features/agent/voice-domain';
import { mockFeedbackAction } from './actions';
import { MOCK_ANSWER_MAX } from './mock-domain';

/**
 * The mock interview (WI-108): five questions from the prep doc, one at a time, read aloud
 * on request and answered by typing or, with consent, by voice; Rumi gives one paragraph of
 * feedback per answer and never a score. The turns are a conversation in Ask Rumi.
 */
export function MockInterview({
  docId,
  questions,
  voice,
}: {
  docId: string;
  questions: string[];
  voice: VoiceState;
}) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canDictate = useCanDictate();
  const onText = useCallback(
    (f: string, i: string) => setAnswer([f, i].filter(Boolean).join(' ')),
    [],
  );
  const onError = useCallback((c: string) => setError(dictationError(c)), []);
  const dictation = useDictation({
    lang: voice.lang,
    silenceMs: SILENCE_MS * 2,
    onText,
    onError,
  });
  const q = questions[index];
  if (!q)
    return (
      <section className="card mock-done" aria-labelledby="mock-done">
        <h2 id="mock-done">That was the last question</h2>
        <p>
          The questions and the feedback are a conversation in Ask {AGENT_NAME};
          delete it there whenever you like.
        </p>
        {conversationId && (
          <Link className="button" href={`/rumi?c=${conversationId}`}>
            Open the conversation
          </Link>
        )}
      </section>
    );
  return (
    <section className="card mock" aria-labelledby="mock-question">
      <p className="eyebrow">
        Question {index + 1} of {questions.length}
      </p>
      <h2 id="mock-question">{q}</h2>
      <div className="actions">
        <ListenLine text={q} lang={voice.lang} />
      </div>
      {feedback === null ? (
        <form
          className="mock-answer"
          onSubmit={(e) => {
            e.preventDefault();
            if (dictation.listening) dictation.stop();
            start(async () => {
              setError(null);
              const r = await mockFeedbackAction({
                docId,
                index,
                answer,
                conversationId,
              });
              if (!r.ok) return setError(r.message);
              setFeedback(r.feedback);
              setConversationId(r.conversationId);
            });
          }}
        >
          <label htmlFor="mock-answer">Your answer</label>
          <div className="mock-compose">
            <textarea
              id="mock-answer"
              rows={7}
              maxLength={MOCK_ANSWER_MAX}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            {voice.consented && canDictate && (
              <MicButton
                listening={dictation.listening}
                onClick={() =>
                  dictation.listening ? dictation.stop() : dictation.start()
                }
              />
            )}
          </div>
          {error && (
            <p className="form-message" role="alert">
              {error}
            </p>
          )}
          <button
            className="button"
            disabled={pending || answer.trim().length < 10}
          >
            {pending ? `${AGENT_NAME} is reading your answer…` : 'Get feedback'}
          </button>
        </form>
      ) : (
        <div className="mock-feedback" aria-live="polite">
          <p className="eyebrow">{AGENT_NAME}’s feedback</p>
          <p>{feedback}</p>
          <div className="actions">
            <ListenLine text={feedback} lang={voice.lang} />
            <button
              type="button"
              className="button"
              onClick={() => {
                setIndex(index + 1);
                setAnswer('');
                setFeedback(null);
              }}
            >
              {index + 1 < questions.length ? 'Next question' : 'Finish'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
