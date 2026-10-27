'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dollars } from '@/features/ai/domain';
import { AGENT_NAME } from '@/features/agent/domain';
import { prepAction } from './actions';

/**
 * Prepare with Rumi (WI-042): what will be searched and sent, shown before anything leaves.
 * The job description goes only when ticked, and only to the writing call, never a search.
 */
export function PreparePanel({
  applicationId,
  company,
  preview,
}: {
  applicationId: string;
  company: string;
  preview: {
    queries: string[];
    rounds: number;
    roadmapItems: number;
    problems: number;
    hasJobDescription: boolean;
    estimateMicros: number;
  };
}) {
  const router = useRouter();
  const [jd, setJd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="prep-panel">
      <div className="panel-section">
        <h3>Searched on the web</h3>
        <ul className="prep-queries">
          {preview.queries.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
        <p className="prep-note">
          Only these words reach the search engine (Exa): the company, the role
          and the round types.
        </p>
      </div>
      <div className="panel-section">
        <h3>Sent to write the doc</h3>
        <dl className="sent-fields">
          <div>
            <dt>Research</dt>
            <dd>What the searches found, with their links</dd>
          </div>
          <div>
            <dt>Interviews</dt>
            <dd>
              {preview.rounds
                ? `${preview.rounds} ${preview.rounds === 1 ? 'round' : 'rounds'}: title, type, date`
                : 'No rounds yet'}
            </dd>
          </div>
          <div>
            <dt>Your study</dt>
            <dd>
              {preview.roadmapItems} roadmap item titles (Study AI on) and{' '}
              {preview.problems} problem titles, to map topics to them
            </dd>
          </div>
          <div className="is-muted">
            <dt>Your notes</dt>
            <dd>Never sent, nor contacts, compensation or reflections</dd>
          </div>
        </dl>
        {preview.hasJobDescription && (
          <label className="check mt-3">
            <input
              type="checkbox"
              checked={jd}
              onChange={(e) => setJd(e.target.checked)}
            />
            Also send the job description (to the writing call only)
          </label>
        )}
      </div>
      <p className="prep-note">
        About {dollars(preview.estimateMicros)} · takes about half a minute
      </p>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await prepAction(applicationId, jd);
            if (result.ok) router.push(result.href);
            else setError(result.message);
          })
        }
      >
        {pending
          ? `${AGENT_NAME} is researching ${company}…`
          : 'Research and write'}
      </button>
    </div>
  );
}
