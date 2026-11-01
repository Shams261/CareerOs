'use client';
import { isSunday } from '@/features/agent/page-domain';
import { RumiPose } from '@/features/agent/pose';
import { RumiMark } from '@/features/agent/mark';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { AGENT_NAME } from '@/features/agent/domain';
import { askRumi, prefillRumi } from '@/features/agent/events';
import { ListenLine } from '@/features/agent/voice';
import { lineHeading, PART_WORDS } from '@/features/agent/line-domain';
import {
  letGoAction,
  moveToTomorrowAction,
  nudgeFeedbackAction,
  restDayAction,
} from './actions';

export type NudgeCardProps = {
  nudge: {
    id: string;
    kind: 'morning' | 'midday' | 'evening' | 'block';
    body: string;
    /** Rumi wrote this line (WI-101). */
    rumi?: boolean;
  };
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
 * Today's study nudge (WI-028, and WI-039's block-start nudge): the facts, the block it is
 * about, and calm next steps. Starting goes through Focus; moving, letting go and resting
 * show what will change and wait for Confirm.
 */
export function NudgeCard({ nudge, block, day }: NudgeCardProps) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<'move' | 'rest' | 'letgo' | null>(
    null,
  );
  const evening = nudge.kind === 'evening';
  const started = nudge.kind === 'block';
  const midday = nudge.kind === 'midday';
  const rumi = !!nudge.rumi && !started;
  const heading = rumi
    ? lineHeading(nudge.kind as 'morning' | 'midday' | 'evening', AGENT_NAME)
    : evening
      ? 'Study check-in'
      : started
        ? 'Block started'
        : midday
          ? 'This afternoon'
          : 'Good morning';
  const go = (href: string) => router.push(href);
  return (
    <section
      id="study-nudge"
      className={rumi ? 'nudge has-pose' : 'nudge'}
      aria-labelledby="study-nudge-heading"
      tabIndex={-1}
    >
      {rumi && (
        <RumiPose
          pose={evening ? 'writing' : midday ? 'working' : 'morning-coffee'}
          size={88}
          className="nudge-pose"
        />
      )}
      <h2 id="study-nudge-heading">
        {rumi && <RumiMark size={24} />}
        {heading}
      </h2>
      <p className="nudge-line">{nudge.body}</p>
      {block && (
        <p className="nudge-block">
          <span>
            <b>{block.window}</b> · {block.title}
          </span>
          <span className="muted">
            {evening
              ? 'Not recorded'
              : started
                ? 'Not started'
                : midday
                  ? 'Next'
                  : 'Planned'}
          </span>
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
      ) : confirm === 'letgo' && block ? (
        <ActionForm
          action={letGoAction}
          label={`Let go of ${block.title}`}
          broadcast="nudge"
          className="nudge-confirm"
        >
          <input type="hidden" name="id" value={block.id} />
          <p>Let go of {block.title} for today? It is marked skipped.</p>
          <div className="actions">
            <Button>Let go</Button>
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
              {evening || started ? 'Start 20 min' : 'Start 20 min now'}
            </Link>
          )}
          {started && block ? (
            <>
              <Button
                type="button"
                className="secondary"
                onClick={() => setConfirm('move')}
              >
                Move to tomorrow
              </Button>
              <Button
                type="button"
                className="secondary"
                onClick={() => setConfirm('letgo')}
              >
                Let go
              </Button>
            </>
          ) : evening ? (
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
          {evening && isSunday(day) && (
            // WI-117: Sunday evening, the week ahead is one press away.
            <Button
              type="button"
              className="secondary"
              onClick={() =>
                askRumi('Plan next week for me, starting Monday', go)
              }
            >
              Plan next week with {AGENT_NAME}
            </Button>
          )}
          {rumi && (
            <>
              <Button
                type="button"
                className="secondary"
                onClick={() =>
                  askRumi(
                    `About your ${PART_WORDS[nudge.kind as 'morning' | 'midday' | 'evening'].toLowerCase()} line: “${nudge.body}”`,
                    go,
                  )
                }
              >
                Ask {AGENT_NAME} about this
              </Button>
              <Button
                type="button"
                className="secondary"
                onClick={() => prefillRumi(`Re “${nudge.body}”: `, go)}
              >
                Reply
              </Button>
              {/* The line only, read by this device's voice (WI-104). */}
              <ListenLine text={nudge.body} />
            </>
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
