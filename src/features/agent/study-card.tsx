'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AGENT_NAME } from './constants';
import { RumiMark } from './mark';
import type { StudyRequest } from '@/lib/rumi';

// Loaded when a chip asks for them, so the drawer on every page stays light.
const GrillMe = dynamic(() =>
  import('@/features/ai/grill').then((m) => m.GrillMe),
);
const Listen = dynamic(() =>
  import('@/features/listen/listen').then((m) => m.Listen),
);

/**
 * Grill me or Read it to me as a card in Rumi's chat (WI-144). The engines are the same as on
 * the item before (the pinned zero-retention call, the sourced script); nothing on the card is
 * stored, and closing it is the end of it.
 */
export function StudyCard({
  study,
  onClose,
}: {
  study: StudyRequest;
  onClose: () => void;
}) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' });
  }, [study]);
  const title =
    study.kind === 'grill'
      ? `Grill me · ${study.item.title}`
      : `Read it to me · ${study.item.title}`;
  return (
    <section
      ref={box}
      aria-label={title}
      className="my-3 grid gap-3 rounded-md border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <RumiMark size={22} />
        <h3 className="m-0 min-w-0 flex-1 text-[15px] font-semibold text-ink">
          <span className="text-meta">{AGENT_NAME} · </span>
          {title}
        </h3>
        <button
          type="button"
          className="link-button inline-flex items-center"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {study.kind === 'grill' ? (
        <GrillMe
          key={study.item.id}
          item={study.item}
          budget={study.budget}
          status={study.status}
          revisionDue={study.revisionDue}
        />
      ) : (
        <Listen key={study.item.id} item={study.item} budget={study.budget} />
      )}
    </section>
  );
}
