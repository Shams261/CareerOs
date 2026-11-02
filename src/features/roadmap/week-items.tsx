'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, Circle, CircleCheck, CircleDot } from 'lucide-react';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import type { RoadmapItem } from '@/generated/prisma/client';
import type { ItemStatus, Scenario } from './domain';
import {
  afterDone,
  afterRemoval,
  initialItem,
  statusBadge,
} from './week-items-domain';
import { OPEN_ITEM_EVENT } from './events';
import { ItemBody } from './item-body';

export type RowLinks = {
  learningTopic: { id: string; title: string; subject: string } | null;
  dsaProblem: {
    id: string;
    title: string;
    confidence: 'RED' | 'YELLOW' | 'GREEN';
    attemptsCount: number;
    /** "Oct 28" when a revision is scheduled. */
    nextRevision: string | null;
  } | null;
  dsaTopic: { id: string; name: string } | null;
};
export type Row = {
  item: RoadmapItem;
  revision: 'none' | 'upcoming' | 'due' | 'overdue';
  /** "Oct 28" for the meta column; set when a revision is scheduled. */
  revisionLabel: string | null;
  /** "Revision due today", "Revision overdue by 2 days", "Revision due Oct 28" (WI-023). */
  revisionText: string | null;
  links: RowLinks;
  /** Revision cards kept from Grill Me (WI-031). */
  cards: {
    id: string;
    question: string;
    change: string | null;
    points: string[];
  }[];
  /** Grill Me is offered for this item (AI on, Study AI on, not a test record). */
  grillable: boolean;
  /** Listen is offered too: Grill Me's conditions and a reference on a checked site (WI-037). */
  listenable: boolean;
  /** The page lists the row; search and Show hide the others. */
  shown: boolean;
  /** "Oct 28": the day the item was marked done, in the owner's zone (WI-085). */
  doneLabel: string | null;
};

const statusText: Record<ItemStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'Started',
  DONE: 'Done',
};

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function StatusIcon({ status, pop }: { status: ItemStatus; pop: boolean }) {
  const common = {
    size: 20,
    'aria-hidden': true as const,
    strokeWidth: 1.8,
    className: `item-icon${status === 'DONE' ? ' is-done' : status === 'IN_PROGRESS' ? ' is-active' : ''}${pop ? ' is-pop' : ''}`,
  };
  if (status === 'DONE') return <CircleCheck {...common} />;
  if (status === 'IN_PROGRESS') return <CircleDot {...common} />;
  return <Circle {...common} />;
}

/**
 * A week's items as rows that open in place (WI-088, the shape of Practice's pattern bands):
 * one row per item with its status icon, title, P0 and status badge; the open row shows the
 * task card of WI-085 under its title. The first item still to do is open on arrival; a hash
 * or the command bar names another; Mark done moves the open row to the next item left.
 * Keys: J and K move along the rows, Enter opens the focused row, D marks done (or revised),
 * C copies the prompt, Esc closes the open row.
 */
export function WeekItems({
  roadmap,
  scenarios,
  sections,
  rows,
  next,
  section,
  q = '',
  grill = null,
}: {
  roadmap: { id: string; title: string; promptTemplate: string | null };
  scenarios: Scenario[];
  /** Every section of the roadmap, for the item form's section field. */
  sections: string[];
  /** The rows of this section, in order. */
  rows: Row[];
  /** The Continue item, open on arrival when no link named another. */
  next: string | null;
  section: string;
  q?: string;
  /** Grill Me for this roadmap, with the month's budget line; null when off (WI-031). */
  grill?: { budget: string } | null;
}) {
  const hashId = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.replace('#item-', ''),
    () => '',
  );
  const paneRows = rows.map((r) => ({
    id: r.item.id,
    section: r.item.section,
    status: r.item.status,
    shown: r.shown,
  }));
  // The open row is picked once on arrival and then only by the owner, a link, the command bar
  // or a Mark done: the server's Continue item changing never moves it.
  const [open, setOpen] = useState<string | null>(() =>
    initialItem(paneRows, { hash: hashId || null, section, next }),
  );
  // A new hash (a link, or the command bar on this same page) wins over an earlier click.
  const [seenHash, setSeenHash] = useState(hashId);
  if (hashId !== seenHash) {
    setSeenHash(hashId);
    if (hashId && rows.some((r) => r.item.id === hashId)) setOpen(hashId);
  }
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (rows.some((r) => r.item.id === id)) setOpen(id);
    };
    window.addEventListener(OPEN_ITEM_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ITEM_EVENT, onOpen);
  }, [rows]);
  // The open row comes into view when something other than a click opened it.
  const listRef = useRef<HTMLOListElement>(null);
  const lastOpen = useRef(open);
  useEffect(() => {
    if (lastOpen.current === open) return;
    lastOpen.current = open;
    if (!open) return;
    const el = document.getElementById(`week-item-${open}`);
    if (el && el.getBoundingClientRect().top < 0)
      el.scrollIntoView({ block: 'start' });
  }, [open]);
  // The icon pops once when an item turns done while the page is open.
  const statuses = useRef(new Map(rows.map((r) => [r.item.id, r.item.status])));
  const [popped, setPopped] = useState<string | null>(null);
  // Optimistic marks (WI-017): the row flips as soon as a choice is made and reconciles with
  // the server's rows; a failed action puts it back.
  const [optimistic, setOptimistic] = useState<Map<string, ItemStatus>>(
    new Map(),
  );
  const toggleOf = (id: string) =>
    document.querySelector<HTMLButtonElement>(
      `#week-item-${id} .week-item-toggle`,
    );
  const flip = (id: string, f: FormData) => {
    const op = f.get('op');
    const to: ItemStatus | null =
      op === 'done'
        ? 'DONE'
        : op === 'start' || op === 'reopen'
          ? 'IN_PROGRESS'
          : op === 'unstart'
            ? 'NOT_STARTED'
            : null;
    if (!to) return;
    setOptimistic((m) => new Map(m).set(id, to));
    if (to === 'DONE') {
      statuses.current.set(id, 'DONE');
      setPopped(id);
      setTimeout(() => setPopped((p) => (p === id ? null : p)), 900);
      // Done moves the open row to the next item left (WI-088), and the keyboard with it, so
      // j / k / c continue from the row that is now open, not the one just finished.
      if (open === id) {
        const to = afterDone(paneRows, id);
        setOpen(to);
        if (to && to !== id)
          setTimeout(() => toggleOf(to)?.focus({ preventScroll: true }), 0);
      }
    }
  };
  const settle = (id: string, ok: boolean | undefined) => {
    if (ok) return;
    setOptimistic((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
    statuses.current.set(
      id,
      rows.find((r) => r.item.id === id)?.item.status ?? 'NOT_STARTED',
    );
  };
  const [seenRows, setSeenRows] = useState(rows);
  if (rows !== seenRows) {
    setSeenRows(rows);
    // The open item left the rows (removed): the open row moves to its neighbour.
    const moved = afterRemoval(
      seenRows.map((r) => ({
        id: r.item.id,
        section: r.item.section,
        status: r.item.status,
        shown: r.shown,
      })),
      paneRows,
      open,
    );
    if (moved !== open) setOpen(moved);
    if (optimistic.size) {
      const n = new Map(optimistic);
      for (const r of rows)
        if (n.get(r.item.id) === r.item.status) n.delete(r.item.id);
      if (n.size !== optimistic.size) setOptimistic(n);
    }
  }
  useEffect(() => {
    const turned = rows.find(
      (r) =>
        r.item.status === 'DONE' &&
        statuses.current.get(r.item.id) &&
        statuses.current.get(r.item.id) !== 'DONE',
    );
    statuses.current = new Map(rows.map((r) => [r.item.id, r.item.status]));
    if (!turned) return;
    const id = turned.item.id;
    const timer = setTimeout(
      () => setPopped((p) => (p === id ? null : p)),
      900,
    );
    setPopped(id);
    return () => clearTimeout(timer);
  }, [rows]);
  const statusOf = (r: Row) => optimistic.get(r.item.id) ?? r.item.status;

  // Keyboard: the page's shortcut list presses these hidden buttons.
  const toggles = () => [
    ...(listRef.current?.querySelectorAll<HTMLButtonElement>(
      '.week-item-toggle',
    ) ?? []),
  ];
  const move = (delta: 1 | -1) => {
    const all = toggles();
    if (!all.length) return;
    const focused = all.findIndex((b) => b === document.activeElement);
    const current =
      focused >= 0 ? focused : all.findIndex((b) => b.dataset.item === open);
    const at = Math.min(
      all.length - 1,
      Math.max(0, (current < 0 ? -1 : current) + delta),
    );
    all[at].focus();
    all[at].scrollIntoView({ block: 'nearest' });
  };
  const pressIn = (id: string | null, selector: string) =>
    id &&
    document
      .getElementById(`week-item-${id}`)
      ?.querySelector<HTMLElement>(selector)
      ?.click();
  const pressInOpen = (selector: string) => pressIn(open, selector);
  const shown = rows.filter((r) => r.shown || r.item.id === open);
  return (
    <div className="week-items-region">
      <span hidden>
        <button
          type="button"
          data-shortcut="row-next"
          onClick={() => move(1)}
          tabIndex={-1}
        />
        <button
          type="button"
          data-shortcut="row-prev"
          onClick={() => move(-1)}
          tabIndex={-1}
        />
        <button
          type="button"
          data-shortcut="row-done"
          tabIndex={-1}
          onClick={() =>
            pressInOpen('button[value="revised"], button[value="done"]')
          }
        />
        <button
          type="button"
          data-shortcut="row-copy"
          tabIndex={-1}
          onClick={() => {
            // The focused row's prompt, opening it first; else the open row's.
            const focused = document.activeElement as HTMLElement | null;
            const id =
              focused?.closest<HTMLElement>('.week-item-toggle')?.dataset.item;
            const target = id ?? open;
            if (id && id !== open) setOpen(id);
            setTimeout(
              () => pressIn(target, '.pane-tool-main, .study-prompt button'),
              50,
            );
          }}
        />
        <button
          type="button"
          data-shortcut="row-grill"
          tabIndex={-1}
          onClick={() => pressInOpen('[data-grill-open]')}
        />
        <button
          type="button"
          data-shortcut="row-close"
          tabIndex={-1}
          onClick={() => {
            toggles()
              .find((b) => b.dataset.item === open)
              ?.focus();
            setOpen(null);
          }}
        />
      </span>
      {/* The row's answer (Done · Undo, Removed · Undo) floats at the foot of the screen, so it
          is in view wherever the open row sits (WI-089). */}
      <FeedbackOutlet channel="roadmap-items" className="feedback-float" />
      {!shown.length && (
        <p className="muted week-empty">
          {q ? `Nothing matches “${q}” in this week.` : 'Nothing matches here.'}
        </p>
      )}
      <ol className="plain-list week-items" ref={listRef}>
        {shown.map((r) => {
          const status = statusOf(r);
          const isOpen = open === r.item.id;
          const badge = statusBadge({
            status,
            revision: r.revision,
            revisionText: r.revisionText,
            doneLabel: r.doneLabel,
            revisionLabel: r.revisionLabel,
          });
          const bodyId = `week-item-body-${r.item.id}`;
          return (
            <li
              key={r.item.id}
              id={`week-item-${r.item.id}`}
              className={`week-item is-${status.toLowerCase().replace('_', '-')}${isOpen ? ' is-open' : ''}`}
            >
              <h2 className="week-item-head">
                <button
                  type="button"
                  className="week-item-toggle"
                  data-item={r.item.id}
                  aria-expanded={isOpen}
                  aria-controls={bodyId}
                  onClick={() => setOpen(isOpen ? null : r.item.id)}
                >
                  <StatusIcon status={status} pop={popped === r.item.id} />
                  <span className="week-item-title">
                    <span className="sr-only">{statusText[status]}: </span>
                    {r.item.title}
                    {r.item.priority === 1 && (
                      <span className="pill priority">P0</span>
                    )}
                  </span>
                  <span
                    className={`status-badge is-${badge.tone} week-item-badge`}
                    aria-hidden="true"
                  >
                    {badge.text}
                  </span>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className="week-item-chevron"
                  />
                </button>
              </h2>
              <div id={bodyId} className="week-item-body" hidden={!isOpen}>
                {isOpen && (
                  <ItemBody
                    key={r.item.id}
                    row={r}
                    status={status}
                    roadmap={roadmap}
                    scenarios={scenarios}
                    sections={sections}
                    grill={grill}
                    flip={flip}
                    settle={settle}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
