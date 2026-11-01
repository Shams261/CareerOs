'use client';
import { useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { ActionForm, UndoButton } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { weekdayDate } from '@/lib/time';
import {
  answerSuggestionAction,
  applyProposalAction,
  dismissProposalAction,
  undoWriteAction,
  applyRequestAction,
  dismissRequestAction,
} from './actions';
import { REQUEST_WORDS, type CardView } from './request-domain';
import { useRouter } from 'next/navigation';
import type { WriteAction } from './write-domain';
import { AGENT_NAME } from './domain';
import {
  addable,
  type Kept,
  type Proposal,
  type Suggestion,
} from './plan-domain';

const Ids = ({ messageId, cardId }: { messageId: string; cardId: string }) => (
  <>
    <input type="hidden" name="messageId" value={messageId} />
    <input type="hidden" name="cardId" value={cardId} />
  </>
);

/**
 * A plan Rumi proposed (WI-041): each block with its time, kind and reason; blocks that do
 * not fit say why and are never added. Add to plan writes the rest all or none, with Undo.
 */
export function ProposalCard({
  messageId,
  proposal,
  today,
}: {
  messageId: string;
  proposal: Proposal;
  today: string;
}) {
  const [status, setStatus] = useState(proposal.status);
  // Blocks the owner took out before adding; they stay listed under Left out (WI-058).
  const [skip, setSkip] = useState<number[]>([]);
  // Times the owner changed, and blocks they added, before Add to plan (WI-107).
  const [edits, setEdits] = useState<
    Record<number, { start: string; end: string }>
  >({});
  const [editing, setEditing] = useState<number | null>(null);
  const [extra, setExtra] = useState<
    { title: string; kind: string; start: string; end: string }[]
  >([]);
  const [adding, setAdding] = useState(false);
  const can = addable(proposal, skip).length + extra.length;
  const open = status !== 'applied' && status !== 'dismissed';
  const kept = proposal.blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b, i }) => !b.conflict && !skip.includes(i));
  const leftOut = proposal.blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b, i }) => b.conflict || skip.includes(i));
  const where =
    proposal.day === today ? '/today' : `/calendar?date=${proposal.day}`;
  const channel = `rumi-plan-${proposal.id}`;
  return (
    <div
      className="rumi-card"
      role="group"
      aria-label={`Plan for ${weekdayDate(proposal.day)}`}
    >
      <p className="rumi-card-head">
        <span className="eyebrow">Plan</span>
        <span>
          {proposal.day === today ? 'Today' : weekdayDate(proposal.day)}
        </span>
      </p>
      {kept.length > 0 && (
        <ul className="plain-list rumi-plan">
          {kept.map(({ b, i }) => (
            <li key={i}>
              <span className="rumi-plan-time">
                {edits[i]?.start ?? b.start}–{edits[i]?.end ?? b.end}
              </span>
              <span className="rumi-plan-main">
                <span className="rumi-plan-title">
                  {b.title} <span className="rumi-plan-kind">· {b.kind}</span>
                </span>
                <span className="rumi-plan-reason">{b.reason}</span>
                {open && (
                  <button
                    type="button"
                    className="link-button rumi-plan-change"
                    aria-expanded={editing === i}
                    onClick={() => setEditing(editing === i ? null : i)}
                  >
                    {editing === i ? 'Done' : 'Change time'}
                  </button>
                )}
                {open && editing === i && (
                  <span className="rumi-plan-edit">
                    <label>
                      Start
                      <input
                        type="time"
                        defaultValue={edits[i]?.start ?? b.start}
                        onChange={(e) =>
                          setEdits((x) => ({
                            ...x,
                            [i]: {
                              start: e.target.value,
                              end: x[i]?.end ?? b.end,
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      End
                      <input
                        type="time"
                        defaultValue={edits[i]?.end ?? b.end}
                        onChange={(e) =>
                          setEdits((x) => ({
                            ...x,
                            [i]: {
                              start: x[i]?.start ?? b.start,
                              end: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  </span>
                )}
              </span>

              {open && (
                <button
                  type="button"
                  className="rumi-plan-remove"
                  aria-label={`Leave out ${b.title} ${b.start}–${b.end}`}
                  onClick={() => setSkip((s) => [...s, i])}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {leftOut.length > 0 && (
        <div className="rumi-left-out">
          <p className="rumi-plan-reason">Left out · {leftOut.length}</p>
          <ul className="plain-list">
            {leftOut.map(({ b, i }) => (
              <li key={i} className="rumi-plan-reason">
                {b.start}–{b.end} {b.title}: {b.conflict ?? 'you took it out'}
                {!b.conflict && open && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setSkip((s) => s.filter((x) => x !== i))}
                    >
                      Put back
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {extra.length > 0 && (
        <ul className="plain-list rumi-plan">
          {extra.map((x, j) => (
            <li key={`extra-${j}`}>
              <span className="rumi-plan-time">
                {x.start}–{x.end}
              </span>
              <span className="rumi-plan-main">
                <span className="rumi-plan-title">
                  {x.title} <span className="rumi-plan-kind">· {x.kind}</span>
                </span>
                <span className="rumi-plan-reason">Added by you</span>
              </span>
              {open && (
                <button
                  type="button"
                  className="rumi-plan-remove"
                  aria-label={`Take out ${x.title} ${x.start}–${x.end}`}
                  onClick={() => setExtra((e) => e.filter((_, k) => k !== j))}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {open &&
        extra.length < 4 &&
        (adding ? (
          <form
            className="rumi-plan-add"
            aria-label="Add a block to this plan"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setExtra((x) => [
                ...x,
                {
                  title: String(f.get('title') ?? '').trim(),
                  kind: String(f.get('kind') ?? '').trim() || 'Technical',
                  start: String(f.get('start')),
                  end: String(f.get('end')),
                },
              ]);
              setAdding(false);
            }}
          >
            <label>
              Title
              <input name="title" required maxLength={80} />
            </label>
            <label>
              Kind
              <input name="kind" maxLength={40} placeholder="DSA" />
            </label>
            <label>
              Start
              <input name="start" type="time" required />
            </label>
            <label>
              End
              <input name="end" type="time" required />
            </label>
            <Button className="secondary small">Add to this card</Button>
          </form>
        ) : (
          <button
            type="button"
            className="link-button rumi-plan-add-link"
            onClick={() => setAdding(true)}
          >
            + Add a block
          </button>
        ))}
      <FeedbackOutlet channel={channel} />
      {status === 'applied' ? (
        <p className="rumi-card-done">
          Added.{' '}
          <Link href={where} prefetch={false} className="link">
            Open {proposal.day === today ? 'Today' : 'Plan'}
          </Link>
        </p>
      ) : status === 'dismissed' ? (
        <p className="rumi-card-done">Dismissed.</p>
      ) : (
        <div className="rumi-card-actions">
          {can > 0 && (
            <ActionForm
              action={applyProposalAction}
              label="Add this plan"
              broadcast={channel}
              onSuccess={() => setStatus('applied')}
            >
              <Ids messageId={messageId} cardId={proposal.id} />
              {skip.map((i) => (
                <input key={i} type="hidden" name="skip" value={i} />
              ))}
              <input
                type="hidden"
                name="edits"
                value={JSON.stringify(
                  Object.entries(edits).map(([i, t]) => ({
                    i: Number(i),
                    ...t,
                  })),
                )}
              />
              <input type="hidden" name="extra" value={JSON.stringify(extra)} />
              <Button className="small">
                Add {can === 1 ? 'block' : `${can} blocks`} to plan
              </Button>
            </ActionForm>
          )}
          <ActionForm
            action={dismissProposalAction}
            label="Dismiss this plan"
            onSuccess={() => setStatus('dismissed')}
          >
            <Ids messageId={messageId} cardId={proposal.id} />
            <Button className="secondary small">Dismiss</Button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}

/** A line Rumi suggests for "Rumi knows" (WI-041); nothing is kept unless the owner keeps it. */
export function SuggestionCard({
  messageId,
  suggestion,
}: {
  messageId: string;
  suggestion: Suggestion;
}) {
  const [status, setStatus] = useState(suggestion.status);
  return (
    <div className="rumi-card" role="group" aria-label={`${AGENT_NAME} knows`}>
      <p className="rumi-card-head">
        <span className="eyebrow">Keep in mind?</span>
      </p>
      <p className="rumi-suggestion">“{suggestion.text}”</p>
      <p className="rumi-plan-reason">{suggestion.reason}</p>
      {status === 'shown' ? (
        <div className="rumi-card-actions">
          {(['yes', 'no'] as const).map((keep) => (
            <ActionForm
              key={keep}
              action={answerSuggestionAction}
              label={keep === 'yes' ? 'Keep this line' : 'Dismiss this line'}
              onSuccess={() => setStatus(keep === 'yes' ? 'kept' : 'dismissed')}
            >
              <Ids messageId={messageId} cardId={suggestion.id} />
              <input type="hidden" name="keep" value={keep} />
              <Button className={keep === 'yes' ? 'small' : 'secondary small'}>
                {keep === 'yes' ? `Keep in ${AGENT_NAME} knows` : 'Dismiss'}
              </Button>
            </ActionForm>
          ))}
        </div>
      ) : (
        <p className="rumi-card-done">
          {status === 'kept' ? (
            <>
              Kept.{' '}
              <Link href="/settings#data" prefetch={false} className="link">
                {AGENT_NAME} knows
              </Link>
            </>
          ) : (
            'Dismissed.'
          )}
        </p>
      )}
    </div>
  );
}

/**
 * A card for a bigger change (WI-103): what will change, then one press to apply it, with
 * Undo where the change has one. A review card is a draft the owner edits before Save.
 */
export function RequestCard({
  messageId,
  card,
}: {
  messageId: string;
  card: CardView;
}) {
  const [status, setStatus] = useState(card.status);
  // Just applied here: the answer above the card carries the Undo; after a reload, the card does.
  const [fresh, setFresh] = useState(false);
  const words = REQUEST_WORDS[card.kind];
  const channel = `rumi-card-${card.id}`;
  const review =
    card.kind === 'write_review'
      ? (card.args as {
          notes: string;
          blocker?: string;
          carryForward?: string;
          rating?: number;
        })
      : null;
  return (
    <div
      className="rumi-card"
      role="group"
      aria-label={`${words.eyebrow} card`}
    >
      <p className="rumi-card-head">
        <span className="eyebrow">{words.eyebrow}</span>
      </p>
      <ul className="plain-list rumi-card-lines">
        {card.summary.map((line, i) => (
          <li key={i} className={i ? 'rumi-plan-reason' : 'rumi-card-title'}>
            {line}
          </li>
        ))}
      </ul>
      <FeedbackOutlet channel={channel} />
      {status === 'applied' ? (
        // Just pressed here, the result and its Undo show above in the card's outlet.
        fresh ? null : (
          <p className="rumi-card-done">
            {words.done}{' '}
            {card.canUndo && (
              <UndoButton
                undo={{
                  kind: 'undo-request',
                  payload: { messageId, requestId: card.id },
                }}
                onDone={() => setStatus('shown')}
              />
            )}
          </p>
        )
      ) : status === 'dismissed' ? (
        <p className="rumi-card-done">Dismissed.</p>
      ) : (
        <div className="rumi-card-actions">
          <ActionForm
            action={applyRequestAction}
            label={words.apply}
            broadcast={channel}
            onSuccess={() => {
              setFresh(true);
              setStatus('applied');
            }}
            className={review ? 'rumi-review-form' : undefined}
          >
            <Ids messageId={messageId} cardId={card.id} />
            {review && (
              <>
                <label>
                  What happened
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={2000}
                    required
                    defaultValue={review.notes}
                  />
                </label>
                <label>
                  What got in the way
                  <input
                    name="blocker"
                    maxLength={500}
                    defaultValue={review.blocker ?? ''}
                  />
                </label>
                <label>
                  Carry to tomorrow
                  <input
                    name="carryForward"
                    maxLength={500}
                    defaultValue={review.carryForward ?? ''}
                  />
                </label>
                <label>
                  How did it go (1–5)
                  <select
                    name="rating"
                    defaultValue={review.rating ? String(review.rating) : ''}
                  >
                    <option value="">No rating</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <Button className="small">{words.apply}</Button>
          </ActionForm>
          <ActionForm
            action={dismissRequestAction}
            label={`Dismiss this ${words.eyebrow.toLowerCase()} card`}
            onSuccess={() => setStatus('dismissed')}
          >
            <Ids messageId={messageId} cardId={card.id} />
            <Button className="secondary small">Dismiss</Button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}

/**
 * The changes Rumi made in an answer (WI-102): what was done, with an Undo that stays as long
 * as the answer does; an undone change reads "Undone".
 */
export function ActionRows({
  messageId,
  actions,
}: {
  messageId: string;
  actions: WriteAction[];
}) {
  return (
    <ul
      className="plain-list rumi-actions"
      aria-label={`Changes ${AGENT_NAME} made`}
    >
      {actions.map((a) => (
        <ActionRow key={a.id} messageId={messageId} action={a} />
      ))}
    </ul>
  );
}
function ActionRow({
  messageId,
  action,
}: {
  messageId: string;
  action: WriteAction;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(action.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const where = action.tool === 'add_block' ? null : '/today';
  return (
    <li className="rumi-action" data-status={status}>
      <span className="rumi-action-label">{action.label}</span>
      <span className="rumi-action-detail">
        {action.tool === 'add_note' ? <q>{action.detail}</q> : action.detail}
      </span>
      {status === 'undone' ? (
        <span className="muted">Undone</span>
      ) : (
        <>
          {where && (
            <Link href={where} prefetch={false} className="link">
              Today
            </Link>
          )}
          <button
            type="button"
            className="undo-link"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await undoWriteAction(messageId, action.id);
              setBusy(false);
              if (!r.ok) return setError(r.message);
              setStatus('undone');
              router.refresh();
            }}
          >
            {busy ? 'Undoing…' : 'Undo'}
          </button>
        </>
      )}
      {error && (
        <span role="alert" className="form-message">
          {error}
        </span>
      )}
    </li>
  );
}

/**
 * The lines Rumi kept after an answer (WI-100): "Noted in Rumi knows: …" with Undo, which
 * removes the line; the Settings panel shows them all.
 */
export function KeptRows({ kept }: { kept: Kept[] }) {
  return (
    <ul
      className="plain-list rumi-kept"
      aria-label={`Noted in ${AGENT_NAME} knows`}
    >
      {kept.map((k) => (
        <li key={k.id}>
          <span className="muted">Noted in {AGENT_NAME} knows:</span>{' '}
          <q>{k.text}</q>{' '}
          <UndoButton
            undo={{ kind: 'remove-memory', payload: { id: k.id } }}
            onDone={() => {}}
          />
        </li>
      ))}
    </ul>
  );
}
