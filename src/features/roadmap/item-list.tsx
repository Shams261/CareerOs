'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  CircleDot,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { ActionForm } from '@/components/action-form';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import type { RoadmapItem } from '@/generated/prisma/client';
import { askedNoteAction, itemOpAction, noteAction } from './actions';
import { ItemForm } from './item-form';
import { StudyPrompt } from './study-prompt';
import type { Reference, Scenario } from './domain';
import { Button } from '@/components/ui/button';
import { GrillMe } from '@/features/ai/grill';
import { Listen } from '@/features/listen/listen';
import { OPEN_ITEM_EVENT } from './events';
import { removeCardAction } from '@/features/ai/actions';

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
  elsewhere = [],
  q = '',
  grill = null,
}: {
  roadmap: { id: string; title: string; promptTemplate: string | null };
  scenarios: Scenario[];
  sections: string[];
  rows: Row[];
  initialOpen: string | null;
  /** The active filter; the empty revision view offers the next section with items due. */
  show?: string;
  nextDue?: { name: string; due: number } | null;
  /** Other sections where the search words match; search is scoped to this section. */
  elsewhere?: { name: string; count: number }[];
  q?: string;
  /** Grill Me for this roadmap, with the month's budget line; null when off (WI-031). */
  grill?: { budget: string } | null;
}) {
  const hashId = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.replace('#item-', ''),
    () => '',
  );
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  // A new hash (a link, or the command bar on this same page) wins over an earlier click, so
  // the earlier choice is dropped while rendering (derived from the previous hash).
  const [seenHash, setSeenHash] = useState(hashId);
  if (hashId !== seenHash) {
    setSeenHash(hashId);
    if (hashId) setChosen(undefined);
  }
  // The command bar on this same page names the item outright, even when the hash is unchanged.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (rows.some((r) => r.item.id === id)) setChosen(id);
    };
    window.addEventListener(OPEN_ITEM_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ITEM_EVENT, onOpen);
  }, [rows]);
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
          data-shortcut="row-grill"
          tabIndex={-1}
          onClick={() => pressInRow('[data-grill-open]')}
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
          }}
        />
      </span>
      <FeedbackOutlet channel="roadmap-items" className="mb-3" />
      <ol className="plain-list item-list" ref={listRef}>
        {rows.map(
          ({
            item,
            revision,
            revisionText,
            links,
            cards,
            grillable,
            listenable,
          }) => {
            const isOpen = open === item.id;
            const status = optimistic.get(item.id) ?? item.status;
            const references = (item.references as Reference[] | null) ?? [];
            const meta = [
              item.estimateMinutes ? `${item.estimateMinutes} min` : null,
              revision === 'upcoming' && revisionText ? revisionText : null,
            ].filter(Boolean);
            const longScope = (item.scope?.length ?? 0) > SCOPE_CLAMP;
            const clamped = longScope && expandedScope !== item.id;
            const next = status === 'DONE' ? nextAfter(item.id) : null;
            // A problem item follows Practice (WI-046): its marks come from attempts there.
            const practice = links.dsaProblem
              ? `/dsa/${links.dsaProblem.id}?from=${item.id}`
              : null;
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
                  {revision === 'due' && revisionText && (
                    <span className="pill warning">{revisionText}</span>
                  )}
                  {revision === 'overdue' && revisionText && (
                    <span className="pill danger">{revisionText}</span>
                  )}
                  {meta.length > 0 && <span>{meta.join(' · ')}</span>}
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`item-chevron${isOpen ? ' is-open' : ''}`}
                  />
                </span>
                {!isOpen && practice && (
                  <span className="row-quick">
                    <span className="row-quick-cell">
                      <Link
                        prefetch={false}
                        className="button secondary small"
                        href={practice}
                        aria-label={`Record an attempt: ${item.title}`}
                        title="Record an attempt"
                      >
                        Attempt
                      </Link>
                    </span>
                  </span>
                )}
                {!isOpen && !practice && (
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
                      <p
                        className={`item-scope${clamped ? ' is-clamped' : ''}`}
                      >
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
                              title={
                                r.kind ? `${r.label} · ${r.kind}` : r.label
                              }
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
                            <span className="item-practice">
                              <span className="muted whitespace-nowrap">
                                From Practice
                              </span>
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
                            prefetch={false}
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
                    {/* Study first (WI-053): the prompt is the main path; Grill me and Listen
                        check what stuck, so they sit together under it. */}
                    <section
                      className="study-aids"
                      aria-labelledby={`study-${item.id}`}
                    >
                      <p className="eyebrow" id={`study-${item.id}`}>
                        Study
                      </p>
                      <StudyHint />
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
                      {grill && (grillable || listenable) && (
                        <div
                          className="check-yourself"
                          role="group"
                          aria-label="Check yourself"
                        >
                          <span className="check-yourself-label">
                            Check yourself
                          </span>
                          {grillable && (
                            <PanelButton
                              panel={`grill:${item.id}`}
                              className="button secondary small"
                              data-grill-open
                            >
                              Grill me
                            </PanelButton>
                          )}
                          {listenable && (
                            <PanelButton
                              panel={`listen:${item.id}`}
                              className="button secondary small"
                              data-listen-open
                            >
                              Listen
                            </PanelButton>
                          )}
                        </div>
                      )}
                    </section>
                    {cards.length > 0 && (
                      <section
                        className="kept-cards"
                        aria-label={`Kept cards for ${item.title}`}
                      >
                        <p className="eyebrow">Kept cards · {cards.length}</p>
                        <ul className="plain-list">
                          {cards.map((c) => (
                            <li key={c.id} className="kept-card">
                              <p className="kept-card-q">{c.question}</p>
                              {c.change && (
                                <p className="muted kept-card-change">
                                  {c.change}
                                </p>
                              )}
                              <ul>
                                {c.points.map((p) => (
                                  <li key={p}>{p}</li>
                                ))}
                              </ul>
                              <ActionForm
                                action={removeCardAction}
                                broadcast="roadmap-items"
                                label={`Remove the card ${c.question}`}
                              >
                                <input type="hidden" name="id" value={c.id} />
                                <Button variant="link" className="danger small">
                                  Remove card
                                </Button>
                              </ActionForm>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
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
                        {practice ? (
                          <Link
                            prefetch={false}
                            className="button small"
                            href={practice}
                          >
                            Record an attempt
                          </Link>
                        ) : status === 'DONE' ? (
                          revision === 'due' || revision === 'overdue' ? (
                            <button
                              className="button small"
                              name="op"
                              value="revised"
                            >
                              <Check size={14} aria-hidden="true" /> Mark
                              revised
                            </button>
                          ) : null
                        ) : (
                          <Button className="small" name="op" value="done">
                            <Check size={14} aria-hidden="true" /> Done
                          </Button>
                        )}
                        {!practice && status === 'NOT_STARTED' && (
                          <button
                            className="button secondary small"
                            name="op"
                            value="start"
                          >
                            Start
                          </button>
                        )}
                        {!practice && status === 'DONE' && (
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
                        <PanelButton
                          panel={`item-edit:${item.id}`}
                          className="link-button"
                        >
                          Edit
                        </PanelButton>
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
                    <SidePanel
                      id={`item-edit:${item.id}`}
                      title={`Edit ${item.title}`}
                    >
                      <ItemForm item={item} sections={sections} />
                    </SidePanel>
                    {grill && grillable && (
                      <SidePanel
                        id={`grill:${item.id}`}
                        title={`Grill me · ${item.title}`}
                      >
                        <GrillMe
                          item={{
                            id: item.id,
                            title: item.title,
                            scope: item.scope,
                            checkpoint: item.checkpoint,
                            references: item.references,
                          }}
                          budget={grill.budget}
                          status={status}
                          revisionDue={
                            revision === 'due' || revision === 'overdue'
                          }
                        />
                      </SidePanel>
                    )}
                    {grill && listenable && (
                      <SidePanel
                        id={`listen:${item.id}`}
                        title={`Listen · ${item.title}`}
                      >
                        <Listen
                          item={{
                            id: item.id,
                            title: item.title,
                            scope: item.scope,
                            checkpoint: item.checkpoint,
                            references: item.references,
                          }}
                          budget={grill.budget}
                        />
                      </SidePanel>
                    )}
                  </div>
                )}
              </li>
            );
          },
        )}
        {!rows.length &&
          (show === 'revision' && nextDue ? (
            <li className="muted">
              Nothing due in this section.{' '}
              <Link
                prefetch={false}
                className="link"
                href={`/roadmap/${roadmap.id}?section=${encodeURIComponent(nextDue.name)}&show=revision`}
              >
                Next: {nextDue.name} ({nextDue.due} due){' '}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
          ) : (
            <li className="muted">
              {q ? 'No match in this section.' : 'Nothing matches here.'}
              {q && elsewhere.length > 0 && (
                <>
                  {' '}
                  Found in{' '}
                  {elsewhere.map((s, i) => (
                    <span key={s.name}>
                      {i > 0 && ' · '}
                      <Link
                        prefetch={false}
                        className="link"
                        href={`/roadmap/${roadmap.id}?section=${encodeURIComponent(s.name)}&q=${encodeURIComponent(q)}`}
                      >
                        {s.name} ({s.count})
                      </Link>
                    </span>
                  ))}
                  .
                </>
              )}
              {q &&
                !elsewhere.length &&
                ' Nothing in the other sections either.'}
            </li>
          ))}
      </ol>
      {rows.length > 0 && q && elsewhere.length > 0 && (
        <p className="muted search-elsewhere">
          Also in{' '}
          {elsewhere.map((s, i) => (
            <span key={s.name}>
              {i > 0 && ' · '}
              <Link
                prefetch={false}
                className="link"
                href={`/roadmap/${roadmap.id}?section=${encodeURIComponent(s.name)}&q=${encodeURIComponent(q)}`}
              >
                {s.name} ({s.count})
              </Link>
            </span>
          ))}
        </p>
      )}
    </>
  );
}

const HINT_KEY = 'silsila-study-hint-seen';
const hintListeners = new Set<() => void>();
function subscribeHint(onChange: () => void) {
  hintListeners.add(onChange);
  return () => {
    hintListeners.delete(onChange);
  };
}
function hintSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * The first time an item opens (WI-053), one line says how studying works here; Got it keeps
 * it away on this device. The server renders nothing, so it never flashes for a returning owner.
 */
function StudyHint() {
  const seen = useSyncExternalStore(subscribeHint, hintSeen, () => true);
  if (seen) return null;
  return (
    <p className="study-hint">
      Copy the prompt into Claude or ChatGPT, study there, then come back and
      mark it.{' '}
      <Button
        type="button"
        variant="link"
        onClick={() => {
          try {
            localStorage.setItem(HINT_KEY, '1');
          } catch {
            /* storage unavailable: the hint simply stays */
          }
          hintListeners.forEach((l) => l());
        }}
      >
        Got it
      </Button>
    </p>
  );
}
