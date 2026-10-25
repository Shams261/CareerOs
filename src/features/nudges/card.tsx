'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  moveToTomorrowAction,
  nudgeFeedbackAction,
  restDayAction,
} from './actions';

export type NudgeCardProps = {
  nudge: { id: string; kind: 'morning' | 'evening'; body: string };
  /** The study block the nudge is about, when it is still on today's plan. */
  block: {
    id: string;
    title: string;
    window: string;
    /** "Tue 28 · 18:00–19:00" for the move preview. */
    tomorrow: string;
    status: string;
  } | null;
  day: string;
};

/**
 * Today's study nudge (WI-028): the reviewed line, the block it is about, and calm next steps.
 * Starting goes through Focus; moving and resting show what will change and wait for Confirm.
 */
export function NudgeCard({ nudge, block, day }: NudgeCardProps) {
  const [confirm, setConfirm] = useState<'move' | 'rest' | null>(null);
  const evening = nudge.kind === 'evening';
  return (
    <section
      id="study-nudge"
      className="nudge"
      aria-labelledby="study-nudge-heading"
      tabIndex={-1}
    >
      <h2 id="study-nudge-heading">
        {evening ? 'Study check-in' : 'Good morning'}
      </h2>
      <p className="nudge-line">{nudge.body}</p>
      {block && (
        <p className="nudge-block">
          <span>
            <b>{block.window}</b> · {block.title}
          </span>
          <span className="muted">{evening ? 'Not recorded' : 'Planned'}</span>
        </p>
      )}
      {confirm === 'move' && block ? (
        <ActionForm
          action={moveToTomorrowAction}
          label={`Move ${block.title} to tomorrow`}
          broadcast="nudge"
          className="nudge-confirm"
        >
          <input type="hidden" name="id" value={block.id} />
          <p>Moves to {block.tomorrow}.</p>
          <div className="actions">
            <Button>Confirm move</Button>
            <Button
              type="button"
              className="secondary"
              onClick={() => setConfirm(null)}
            >
              Back
            </Button>
          </div>
        </ActionForm>
      ) : confirm === 'rest' ? (
        <ActionForm
          action={restDayAction}
          label="Mark today as a rest day"
          broadcast="nudge"
          className="nudge-confirm"
        >
          <input type="hidden" name="day" value={day} />
          <p>Mark today as a rest day? Evening check-ins stop for today.</p>
          <div className="actions">
            <Button>Rest today</Button>
            <Button
              type="button"
              className="secondary"
              onClick={() => setConfirm(null)}
            >
              Back
            </Button>
          </div>
        </ActionForm>
      ) : (
        <div className="nudge-actions">
          {block && block.status === 'PLANNED' && (
            <Link
              className="button"
              href={`/focus?block=${block.id}&minutes=20`}
              prefetch={false}
            >
              {evening ? 'Start 20 min' : 'Start 20 min now'}
            </Link>
          )}
          {evening ? (
            <>
              {block && (
                <Link
                  className="button secondary"
                  href={`#block-${block.id}`}
                  prefetch={false}
                >
                  Log what happened
                </Link>
              )}
              {block && (
                <Button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirm('move')}
                >
                  Move to tomorrow
                </Button>
              )}
              <Button
                type="button"
                className="secondary"
                onClick={() => setConfirm('rest')}
              >
                Rest today
              </Button>
            </>
          ) : (
            <Link
              className="button secondary"
              href="/calendar"
              prefetch={false}
            >
              Open the plan
            </Link>
          )}
        </div>
      )}
      <ActionForm
        action={nudgeFeedbackAction}
        label="Was this useful?"
        broadcast="nudge"
        className="nudge-feedback"
      >
        <input type="hidden" name="id" value={nudge.id} />
        <span className="muted">Useful?</span>
        <button className="link-button" name="value" value="HELPFUL">
          Yes
        </button>
        <button className="link-button" name="value" value="NOT_TODAY">
          Not today
        </button>
        <button className="link-button" name="value" value="TOO_MANY">
          Too many
        </button>
        <Link
          className="link-button"
          href="/settings#reminders"
          prefetch={false}
        >
          Settings
        </Link>
      </ActionForm>
    </section>
  );
}
