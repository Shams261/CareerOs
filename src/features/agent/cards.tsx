'use client';
import { useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { weekdayDate } from '@/lib/time';
import {
  answerSuggestionAction,
  applyProposalAction,
  dismissProposalAction,
} from './actions';
import { AGENT_NAME } from './domain';
import { addable, type Proposal, type Suggestion } from './plan-domain';

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
  const can = addable(proposal, skip).length;
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
                {b.start}–{b.end}
              </span>
              <span className="rumi-plan-main">
                <span className="rumi-plan-title">
                  {b.title} <span className="rumi-plan-kind">· {b.kind}</span>
                </span>
                <span className="rumi-plan-reason">{b.reason}</span>
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
