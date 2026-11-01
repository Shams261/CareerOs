'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dollars } from '@/features/ai/domain';
import { AGENT_NAME } from '@/features/agent/domain';
import { typeText } from '@/features/jobs/formats';
import { weekdayDate } from '@/lib/time';
import {
  addInviteRoundAction,
  inviteAction,
  prepAction,
  tickFormatsAction,
} from './actions';
import { INVITE_MAX, type Invite, type InviteRound } from './invite';
import { INVITE_SEARCHES, inviteQueries } from './domain';

/**
 * "I have the invite" (WI-105): the pasted text goes to one call only when ticked, and is
 * never stored; what it names is offered here, each round added only on a press.
 */
function InviteSection({
  applicationId,
  invite,
  setInvite,
}: {
  applicationId: string;
  invite: Invite | null;
  setInvite: (i: Invite | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [send, setSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, string>>({});
  const [formats, setFormats] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open && !invite)
    return (
      <button
        type="button"
        className="link-button"
        onClick={() => setOpen(true)}
      >
        I have the invite
      </button>
    );
  if (!invite)
    return (
      <div className="panel-section prep-invite">
        <h3>The invite</h3>
        <label>
          Paste the invite email or message
          <textarea
            rows={5}
            maxLength={INVITE_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={send}
            onChange={(e) => setSend(e.target.checked)}
          />
          Send the invite text (to one call that reads its rounds and topics; it
          is not stored)
        </label>
        {error && (
          <p className="form-message" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="button secondary small"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await inviteAction(applicationId, text, send);
              if (r.ok) {
                setInvite(r.invite);
                setText('');
              } else setError(r.message);
            })
          }
        >
          {pending ? 'Reading…' : 'Read the invite'}
        </button>
      </div>
    );
  const when = (r: InviteRound) =>
    r.date
      ? `${weekdayDate(r.date)}${r.start ? ` · ${r.start}` : ''}${r.minutes ? ` · ${r.minutes} min` : ''}`
      : 'No date in the invite';
  return (
    <div className="panel-section prep-invite">
      <h3>From the invite</h3>
      {invite.rounds.length ? (
        <ul className="plain-list prep-invite-rounds">
          {invite.rounds.map((r, i) => (
            <li key={i}>
              <span>
                <strong>{typeText(r.type)}</strong>{' '}
                <span className="muted">{when(r)}</span>
              </span>
              {done[i] ? (
                <span className="muted">{done[i]}</span>
              ) : r.date && r.start ? (
                <button
                  type="button"
                  className="button secondary small"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await addInviteRoundAction(applicationId, r);
                      setDone((d) => ({ ...d, [i]: res.message }));
                    })
                  }
                >
                  Add interview
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">The invite names no rounds.</p>
      )}
      {invite.rounds.length > 0 &&
        (formats ? (
          <p className="muted">{formats}</p>
        ) : (
          <button
            type="button"
            className="link-button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await tickFormatsAction(
                  applicationId,
                  invite.rounds.map((r) => r.type),
                );
                setFormats(res.message);
              })
            }
          >
            Tick these formats on the application
          </button>
        ))}
      {invite.topics.length > 0 && (
        <p className="prep-note">
          Topics it mentions, searched first: {invite.topics.join(', ')}
        </p>
      )}
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setInvite(null);
          setOpen(false);
        }}
      >
        Leave the invite out
      </button>
    </div>
  );
}

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
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="prep-panel">
      <InviteSection
        applicationId={applicationId}
        invite={invite}
        setInvite={setInvite}
      />
      <div className="panel-section">
        <h3>Searched on the web</h3>
        <ul className="prep-queries">
          {/* The invite's searches go first (WI-105); the doc keeps eight at most. */}
          {[
            ...new Set([
              ...(invite ? inviteQueries(company, invite.topics) : []),
              ...preview.queries,
            ]),
          ]
            .slice(0, invite ? INVITE_SEARCHES : preview.queries.length)
            .map((q) => (
              <li key={q}>{q}</li>
            ))}
        </ul>
        <p className="prep-note">
          Only these words reach the search engine (Exa): the company, the role
          and the round types
          {invite?.topics.length
            ? ', with the invite’s topics and the company’s careers and system design pages (up to eight searches)'
            : ''}
          .
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
            const result = await prepAction(applicationId, jd, invite);
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
