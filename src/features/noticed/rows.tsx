'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { askRumi } from '@/features/agent/events';
import { openPanelAfterNavigation } from '@/features/command/bar';
import { AGENT_NAME } from '@/features/agent/domain';
import { answerNoticedAction } from './actions';
import type { NoticedCard } from './domain';

/**
 * "Rumi noticed" rows at the top of Needs attention (WI-043): a fact, one way on and Dismiss.
 * Either answer hides the row for a few days and is counted; nothing else changes.
 */
export function NoticedRows({ cards }: { cards: NoticedCard[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [, start] = useTransition();
  const shown = cards.filter((c) => !gone.includes(c.key));
  if (!shown.length) return null;
  const answer = (c: NoticedCard, acted: boolean) => {
    setGone((g) => [...g, c.key]);
    start(async () => {
      await answerNoticedAction({ key: c.key, kind: c.kind, acted });
    });
    if (!acted) return;
    if ('ask' in c.action) {
      askRumi(c.action.ask, (href) => router.push(href));
      return;
    }
    router.push(c.action.href);
    if (c.action.panel) openPanelAfterNavigation(c.action.href, c.action.panel);
  };
  return (
    <ul
      className="plain-list attention-list noticed-list"
      aria-label={`${AGENT_NAME} noticed`}
    >
      {shown.map((c) => (
        <li
          key={c.key}
          className="attention-row noticed-row"
          data-source="rumi"
        >
          <span className="attention-link is-static">
            <span className="attention-icon" aria-hidden="true">
              <MessageCircle size={22} />
            </span>
            <span className="attention-main">
              <span className="attention-label">{AGENT_NAME} noticed</span>
              <span className="attention-title">{c.title}</span>
              <span className="attention-context">{c.context}</span>
            </span>
          </span>
          <span className="noticed-actions">
            <button
              type="button"
              className="button secondary small"
              onClick={() => answer(c, true)}
            >
              {c.action.label}
            </button>
            <button
              type="button"
              className="link-button noticed-dismiss"
              aria-label={`Dismiss: ${c.title}`}
              onClick={() => answer(c, false)}
            >
              <X size={14} aria-hidden="true" />
              Dismiss
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
