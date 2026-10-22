'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Check,
  Circle,
  CircleCheck,
  CircleDot,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import type { RoadmapItem } from '@/generated/prisma/client';
import { askedNoteAction, itemOpAction, noteAction } from './actions';
import { ItemForm } from './item-form';
import { StudyPrompt } from './study-prompt';
import type { Reference, Scenario } from './domain';
import { Button } from '@/components/ui/button';

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
  links: RowLinks;
};

const statusText = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
} as const;
const tone = { RED: 'danger', YELLOW: 'warning', GREEN: 'success' } as const;
/** Scope longer than this is clamped to two lines with Read more. */
const SCOPE_CLAMP = 220;

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function StatusIcon({
  status,
  pop,
}: {
  status: RoadmapItem['status'];
  pop: boolean;
}) {
  const common = {
    size: 18,
    'aria-hidden': true as const,
    strokeWidth: 2,
    className: `item-icon${status === 'DONE' ? ' is-done' : status === 'IN_PROGRESS' ? ' is-active' : ''}${pop ? ' is-pop' : ''}`,
  };
  if (status === 'DONE') return <CircleCheck {...common} />;
  if (status === 'IN_PROGRESS') return <CircleDot {...common} />;
  return <Circle {...common} />;
}

/**
 * The section's items, one open at a time. A row is an icon, the title and a quiet meta
 * column; the open row carries the prompt, the study material, a note and the actions.
 * Keys: J and K move, Enter opens, D marks done, C copies the prompt, Esc closes.
 */
export function ItemList({
  roadmap,
  scenarios,
  sections,
  rows,
  initialOpen,
  show = 'all',
  nextDue = null,
}: {
  roadmap: { id: string; title: string; promptTemplate: string | null };
  scenarios: Scenario[];
  sections: string[];
  rows: Row[];
  initialOpen: string | null;
  /** The active filter; the empty revision view offers the next section with items due. */
  show?: string;
  nextDue?: { name: string; due: number } | null;
}) {
  const hashId = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.replace('#item-', ''),
    () => '',
  );
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState<string | null>(null);
  const [expandedScope, setExpandedScope] = useState<string | null>(null);
  const open =
    chosen !== undefined
      ? chosen
      : hashId && rows.some((r) => r.item.id === hashId)
        ? hashId
        : initialOpen;
  useEffect(() => {
    if (chosen === undefined && hashId)
      document
        .getElementById(`item-${hashId}`)
        ?.scrollIntoView({ block: 'center' });
  }, [chosen, hashId]);
  // The icon pops once when a row turns done while the page is open.
  const statuses = useRef(new Map(rows.map((r) => [r.item.id, r.item.status])));
  const [popped, setPopped] = useState<string | null>(null);
  // Optimistic marks (WI-017): the row flips as soon as Done, Start or Reopen is pressed and
  // reconciles with the server's rows; a failed action puts the row back.
  const [optimistic, setOptimistic] = useState<
    Map<string, RoadmapItem['status']>
  >(new Map());
  const flip = (id: string, f: FormData) => {
    const op = f.get('op');
    const to =
      op === 'done'
        ? 'DONE'
        : op === 'start' || op === 'reopen'
          ? 'IN_PROGRESS'
          : null;
    if (!to) return;
    setOptimistic((m) => new Map(m).set(id, to));
    if (to === 'DONE') {
      statuses.current.set(id, 'DONE');
      setPopped(id);
      setTimeout(() => setPopped((p) => (p === id ? null : p)), 900);
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
  // Server rows that caught up drop their optimistic entry (adjusted during render, so a
  // row restored by Undo or another tab is never masked by a stale flip).
  const [seenRows, setSeenRows] = useState(rows);
  if (rows !== seenRows) {
    setSeenRows(rows);
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
  const toggle = (id: string) => {
    setChosen(open === id ? null : id);
    setEditing(null);
  };
  // Keyboard: the page's shortcut list presses these hidden buttons.
  const listRef = useRef<HTMLOListElement>(null);
  const titles = () => [
    ...(listRef.current?.querySelectorAll<HTMLButtonElement>('.item-title') ??
      []),
  ];
  const move = (delta: 1 | -1) => {
    const all = titles();
    if (!all.length) return;
    const focused = all.findIndex((b) => b === document.activeElement);
    const current =
      focused >= 0
        ? focused
        : all.findIndex((b) => b.closest('.item-row')?.id === `item-${open}`);
    const next = Math.min(
      all.length - 1,
      Math.max(0, (current < 0 ? -1 : current) + delta),
    );
    all[next].focus();
    all[next].scrollIntoView({ block: 'nearest' });
  };
  const activeRow = () => {
    const focused = document.activeElement?.closest('.item-row');
    return focused ?? (open ? document.getElementById(`item-${open}`) : null);
  };
  const pressInRow = (selector: string) =>
    activeRow()?.querySelector<HTMLElement>(selector)?.click();
  const nextAfter = (id: string) => {
    const i = rows.findIndex((r) => r.item.id === id);
    return rows.slice(i + 1).find((r) => r.item.status !== 'DONE') ?? null;
  };
  return (
    <>
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
            pressInRow('button[value="done"], button[value="revised"]')
          }
        />
        <button
          type="button"
          data-shortcut="row-copy"
          tabIndex={-1}
          onClick={() => {
            const row = activeRow();
            if (row && row.id !== `item-${open}`)
              setChosen(row.id.replace('item-', ''));
            setTimeout(() => pressInRow('.study-prompt button'), 50);
          }}
        />
        <button
          type="button"
          data-shortcut="row-close"
          tabIndex={-1}
          onClick={() => {
            if (open)
              titles()
                .find((b) => b.closest('.item-row')?.id === `item-${open}`)
                ?.focus();
            setChosen(null);
            setEditing(null);
          }}
        />
      </span>
      <FeedbackOutlet channel="roadmap-items" className="mb-3" />
      <ol className="plain-list item-list" ref={listRef}>
        {rows.map(({ item, revision, revisionLabel, links }) => {
          const isOpen = open === item.id;
          const status = optimistic.get(item.id) ?? item.status;
          const references = (item.references as Reference[] | null) ?? [];
          const meta = [
            item.estimateMinutes ? `${item.estimateMinutes} min` : null,
            revision === 'upcoming' && revisionLabel
              ? `Revise ${revisionLabel}`
              : null,
          ].filter(Boolean);
          const longScope = (item.scope?.length ?? 0) > SCOPE_CLAMP;
          const clamped = longScope && expandedScope !== item.id;
          const next = status === 'DONE' ? nextAfter(item.id) : null;
          return (
            <li
              key={item.id}
              id={`item-${item.id}`}
              className={`item-row is-${status.toLowerCase().replace('_', '-')}${isOpen ? ' is-open' : ''}`}
            >
              <StatusIcon status={status} pop={popped === item.id} />
              <button
                type="button"
                className="item-title"
                aria-expanded={isOpen}
                aria-controls={`panel-${item.id}`}
                onClick={() => toggle(item.id)}
                title={item.title}
              >
                <span className="sr-only">{statusText[status]}: </span>
                {item.title}
              </button>
              <span className="item-meta">
                {item.askedInInterview && (
                  <span className="pill success">Asked</span>
                )}
                {revision === 'due' && (
                  <span className="pill warning">Revise today</span>
                )}
                {revision === 'overdue' && (
                  <span className="pill danger">Overdue · {revisionLabel}</span>
                )}
                {meta.length > 0 && <span>{meta.join(' · ')}</span>}
              </span>
              {!isOpen && (
                <ActionForm
                  action={itemOpAction}
                  className="row-quick"
                  onPending={(f) => flip(item.id, f)}
                  onSettled={(r) => settle(item.id, r.ok)}
                >
                  <input type="hidden" name="id" value={item.id} />
                  {status === 'DONE' &&
                  (revision === 'due' || revision === 'overdue') ? (
                    <button
                      className="button secondary small"
                      name="op"
                      value="revised"
                      aria-label={`Mark revised: ${item.title}`}
                      title="Mark revised"
                    >
                      <Check size={14} aria-hidden="true" /> Revised
                    </button>
                  ) : status !== 'DONE' ? (
                    <button
                      className="button secondary small"
                      name="op"
                      value="done"
                      aria-label={`Done: ${item.title}`}
                      title="Done"
                    >
                      <Check size={14} aria-hidden="true" /> Done
                    </button>
                  ) : null}
                </ActionForm>
              )}
              {isOpen && (
                <div id={`panel-${item.id}`} className="item-panel">
                  {item.checkpoint && (
                    <div className="item-checkpoint">
                      <b>Done when</b>
                      {item.checkpoint}
                    </div>
                  )}
                  {(item.scope || item.priority === 1) && (
                    <p className={`item-scope${clamped ? ' is-clamped' : ''}`}>
                      {item.priority === 1 && (
                        <span className="pill priority">P0</span>
                      )}
                      {item.scope}
                      {longScope && (
                        <>
                          {' '}
                          <Button
                            type="button"
                            variant="link"
                            onClick={() =>
                              setExpandedScope(clamped ? item.id : null)
                            }
                          >
                            {clamped ? 'Read more' : 'Show less'}
                          </Button>
                        </>
                      )}
                    </p>
                  )}
                  {references.length > 0 && (
                    <ul className="plain-list reference-list">
                      {references.map((r) => (
                        <li key={r.url}>
                          <a
                            className="reference-chip"
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={r.kind ? `${r.label} · ${r.kind}` : r.label}
                          >
                            {r.label}
                            <ExternalLink size={12} aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(item.url ||
                    links.dsaProblem ||
                    links.learningTopic ||
                    links.dsaTopic) && (
                    <p className="item-links">
                      {item.url && (
                        <a
                          className="link"
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open link
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      )}
                      {links.dsaProblem && (
                        <>
                          <Link
                            className="link"
                            href={`/dsa/${links.dsaProblem.id}?from=${item.id}`}
                          >
                            Record an attempt
                          </Link>
                          <span className="item-practice">
                            <span
                              className={`pill ${links.dsaProblem.attemptsCount ? tone[links.dsaProblem.confidence] : ''}`}
                            >
                              {links.dsaProblem.attemptsCount
                                ? links.dsaProblem.confidence
                                : 'Unattempted'}
                            </span>
                            {links.dsaProblem.attemptsCount > 0 && (
                              <span className="muted">
                                {links.dsaProblem.attemptsCount} attempt
                                {links.dsaProblem.attemptsCount === 1
                                  ? ''
                                  : 's'}
                                {links.dsaProblem.nextRevision
                                  ? ` · next revision ${links.dsaProblem.nextRevision}`
                                  : ''}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                      {links.learningTopic && (
                        <Link
                          className="link"
                          href={`/learn/topics/${links.learningTopic.id}`}
                        >
                          {links.learningTopic.subject} —{' '}
                          {links.learningTopic.title}
                        </Link>
                      )}
                      {links.dsaTopic && (
                        <span className="muted">
                          Practice topic: {links.dsaTopic.name}
                        </span>
                      )}
                    </p>
                  )}
                  <StudyPrompt
                    roadmap={{ title: roadmap.title }}
                    template={roadmap.promptTemplate}
                    scenarios={scenarios}
                    storageKey={`silsila-scenario:${roadmap.id}`}
                    item={{
                      title: item.title,
                      section: item.section,
                      scope: item.scope,
                      checkpoint: item.checkpoint,
                      priority: item.priority,
                      estimateMinutes: item.estimateMinutes,
                      references,
                      notes: item.notes,
                      url: item.url,
                    }}
                  />
                  <ActionForm
                    action={noteAction}
                    label={`Note for ${item.title}`}
                    className="note-form"
                  >
                    <input type="hidden" name="id" value={item.id} />
                    <label>
                      My note{' '}
                      <span className="muted">
                        (saves when you leave the field)
                      </span>
                      <textarea
                        name="notes"
                        rows={2}
                        maxLength={20000}
                        defaultValue={item.notes ?? ''}
                        placeholder="What tripped me up, a link, a reminder for next time"
                        onBlur={(e) => {
                          if (e.currentTarget.value !== (item.notes ?? ''))
                            e.currentTarget.form?.requestSubmit();
                        }}
                      />
                    </label>
                    <Button className="secondary small">Save note</Button>
                  </ActionForm>
                  <ActionForm
                    action={itemOpAction}
                    broadcast="roadmap-items"
                    className="item-actions-form"
                    onPending={(f) => flip(item.id, f)}
                    onSettled={(r) => settle(item.id, r.ok)}
                  >
                    <input type="hidden" name="id" value={item.id} />
                    <div className="item-actions">
                      {status === 'DONE' ? (
                        revision === 'due' || revision === 'overdue' ? (
                          <button
                            className="button small"
                            name="op"
                            value="revised"
                          >
                            <Check size={14} aria-hidden="true" /> Mark revised
                          </button>
                        ) : null
                      ) : (
                        <Button className="small" name="op" value="done">
                          <Check size={14} aria-hidden="true" /> Done
                        </Button>
                      )}
                      {status === 'NOT_STARTED' && (
                        <button
                          className="button secondary small"
                          name="op"
                          value="start"
                        >
                          Start
                        </button>
                      )}
                      {status === 'DONE' && (
                        <button
                          className="button secondary small"
                          name="op"
                          value="reopen"
                        >
                          Reopen
                        </button>
                      )}
                      <button
                        className="button secondary small"
                        name="op"
                        value={item.askedInInterview ? 'unasked' : 'asked'}
                        aria-pressed={item.askedInInterview}
                      >
                        {item.askedInInterview ? (
                          <>
                            <Check size={14} aria-hidden="true" /> Asked
                          </>
                        ) : (
                          'Asked in interview'
                        )}
                      </button>
                      <span className="item-actions-spacer" />
                      <Button
                        type="button"
                        variant="link"
                        aria-expanded={editing === item.id}
                        onClick={() =>
                          setEditing((e) => (e === item.id ? null : item.id))
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="link"
                        className="danger"
                        name="op"
                        value="remove"
                      >
                        Remove
                      </Button>
                    </div>
                  </ActionForm>
                  {item.askedInInterview && (
                    <ActionForm
                      action={askedNoteAction}
                      label={`Where ${item.title} came up`}
                      className="asked-form"
                    >
                      <input type="hidden" name="id" value={item.id} />
                      <label>
                        Asked at
                        <input
                          name="askedNote"
                          maxLength={200}
                          defaultValue={item.askedNote ?? ''}
                          placeholder="Amazon phone screen, Oct 2026"
                          onBlur={(e) => {
                            if (
                              e.currentTarget.value !== (item.askedNote ?? '')
                            )
                              e.currentTarget.form?.requestSubmit();
                          }}
                        />
                      </label>
                    </ActionForm>
                  )}
                  {next && (
                    <p className="item-next">
                      Next:{' '}
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => toggle(next.item.id)}
                      >
                        {next.item.title}{' '}
                        <ArrowRight size={14} aria-hidden="true" />
                      </Button>
                    </p>
                  )}
                  {editing === item.id && (
                    <div className="item-edit">
                      <ItemForm item={item} sections={sections} />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!rows.length &&
          (show === 'revision' && nextDue ? (
            <li className="muted">
              Nothing due in this section.{' '}
              <Link
                className="link"
                href={`/roadmap/${roadmap.id}?section=${encodeURIComponent(nextDue.name)}&show=revision`}
              >
                Next: {nextDue.name} ({nextDue.due} due){' '}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
          ) : (
            <li className="muted">Nothing matches here.</li>
          ))}
      </ol>
    </>
  );
}
