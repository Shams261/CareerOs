'use client';
import Link from 'next/link';
import { confidenceWord } from '@/features/dsa/words';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  CircleDot,
  ExternalLink,
} from 'lucide-react';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { MoreMenu } from '@/components/more-menu';
import { ActionForm } from '@/components/action-form';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import type { RoadmapItem } from '@/generated/prisma/client';
import { askedNoteAction, itemOpAction, noteAction } from './actions';
import { ItemForm } from './item-form';
import { StudyPrompt } from './study-prompt';
import type { ItemStatus, Reference, Scenario } from './domain';
import {
  afterDone,
  afterRemoval,
  initialItem,
  kindBadge,
  linkTitle,
  primaryAction,
  problemFacts,
  scopeLines,
  statusBadge,
} from './week-items-domain';
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
const tone = { RED: 'danger', YELLOW: 'warning', GREEN: 'success' } as const;

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
      <FeedbackOutlet channel="roadmap-items" className="mb-3" />
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

/**
 * One item as a task card (WI-085), inside its row since WI-088: the goal (Done when) first,
 * the scope as bullets, the references as rows to study from, the three study tools as cards,
 * the note always present, and one foot with one primary action for the state (Mark done, Mark
 * revised, Record an attempt), the interview mark and ⋯. A problem-linked item shows the
 * problem card instead: its facts, Open on LeetCode, Record an attempt. The status is shown,
 * never chosen: copying the prompt or opening a reference starts an item by itself.
 */
function ItemBody({
  row,
  status,
  roadmap,
  scenarios,
  sections,
  grill,
  flip,
  settle,
}: {
  row: Row;
  status: ItemStatus;
  roadmap: { id: string; title: string; promptTemplate: string | null };
  scenarios: Scenario[];
  sections: string[];
  grill: { budget: string } | null;
  flip: (id: string, f: FormData) => void;
  settle: (id: string, ok: boolean | undefined) => void;
}) {
  const { item, revision, links, cards, grillable, listenable } = row;
  const references = (item.references as Reference[] | null) ?? [];
  // A problem item follows Practice (WI-046): its marks come from attempts there.
  const practice = links.dsaProblem
    ? `/dsa/${links.dsaProblem.id}?from=${item.id}`
    : null;
  const due = revision === 'due' || revision === 'overdue';
  const primary = primaryAction({ status, revision, practice: !!practice });
  const facts = practice ? problemFacts(item.scope) : null;
  const scope = practice ? [] : scopeLines(item.scope);
  // Studying starts the item by itself: the prompt copied or a reference opened.
  const startRef = useRef<HTMLButtonElement>(null);
  const autoStart = () => {
    if (status === 'NOT_STARTED' && !practice) startRef.current?.click();
  };
  const promptItem = {
    title: item.title,
    section: item.section,
    scope: item.scope,
    checkpoint: item.checkpoint,
    priority: item.priority,
    estimateMinutes: item.estimateMinutes,
    references,
    notes: item.notes,
    url: item.url,
  };
  const studyItem = {
    id: item.id,
    title: item.title,
    scope: item.scope,
    checkpoint: item.checkpoint,
    references: item.references,
  };
  const estimate = item.estimateMinutes
    ? item.estimateMinutes >= 60
      ? `${Math.round((item.estimateMinutes / 60) * 10) / 10} h`
      : `${item.estimateMinutes} min`
    : null;
  const meta = [
    item.askedInInterview ? 'asked' : null,
    facts?.difficulty,
    estimate,
    !practice && status !== 'DONE' ? 'Revision 7 days after done' : null,
  ].filter(Boolean);
  return (
    <div className="item-card">
      {meta.length > 0 && (
        <p className="item-metaline">
          {item.askedInInterview && (
            <span className="pill success">Asked in an interview</span>
          )}
          {facts?.difficulty && <span>{facts.difficulty}</span>}
          {estimate && <span>{estimate}</span>}
          {!practice && status !== 'DONE' && (
            <span className="muted">Revision 7 days after done</span>
          )}
        </p>
      )}
      {facts && links.dsaProblem && (
        <dl className="pane-stats">
          <div>
            <dt>Confidence</dt>
            <dd>
              <span
                className={`pill ${links.dsaProblem.attemptsCount ? tone[links.dsaProblem.confidence] : ''}`}
              >
                {links.dsaProblem.attemptsCount
                  ? confidenceWord(links.dsaProblem.confidence)
                  : 'Unattempted'}
              </span>
            </dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>{links.dsaProblem.attemptsCount}</dd>
          </div>
          <div>
            <dt>Next revision</dt>
            <dd>{links.dsaProblem.nextRevision ?? 'Not scheduled'}</dd>
          </div>
          {facts.pattern && (
            <div>
              <dt>Pattern</dt>
              <dd>{facts.pattern}</dd>
            </div>
          )}
        </dl>
      )}
      {facts && (facts.lists.length > 0 || facts.companies.length > 0) && (
        <p className="pane-chips">
          {facts.lists.map((l) => (
            <span className="chip" key={l}>
              {l}
            </span>
          ))}
          {facts.companies.length > 0 && (
            <span className="chip">Asked at {facts.companies.join(', ')}</span>
          )}
        </p>
      )}
      {item.checkpoint && (
        <div className="pane-goal">
          <b>Done when</b>
          <span>{item.checkpoint}</span>
        </div>
      )}
      {scope.length > 1 && (
        <div className="pane-block">
          <b>Scope</b>
          <ul className="pane-scope">
            {scope.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {scope.length === 1 && (
        <div className="pane-block">
          <b>Scope</b>
          <p className="pane-scope-line">{scope[0]}</p>
        </div>
      )}
      {(references.length > 0 || item.url) && (
        <div className="pane-block">
          <b>{practice ? 'Solve' : 'Study here first'}</b>
          <ul className="plain-list pane-refs">
            {item.url && (
              <li>
                <a
                  className="pane-ref"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={autoStart}
                >
                  <span className="pane-ref-kind" aria-hidden="true">
                    {practice ? 'GO' : 'LINK'}
                  </span>
                  <span className="pane-ref-title">
                    {linkTitle(item.url)}
                    <small>
                      {item.url.replace(/^https?:\/\/(www\.)?/, '')}
                    </small>
                  </span>
                  <span className="pane-ref-open">
                    Open <ExternalLink size={13} aria-hidden="true" />
                  </span>
                </a>
              </li>
            )}
            {references.map((r) => (
              <li key={r.url}>
                <a
                  className="pane-ref"
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={autoStart}
                >
                  <span className="pane-ref-kind" aria-hidden="true">
                    {kindBadge(r.kind)}
                  </span>
                  <span className="pane-ref-title">
                    {r.label}
                    {r.kind && <small>{r.kind}</small>}
                  </span>
                  <span className="pane-ref-open">
                    Open <ExternalLink size={13} aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(links.learningTopic || links.dsaTopic) && (
        <p className="item-links">
          {links.learningTopic && (
            <Link
              prefetch={false}
              className="link"
              href={`/learn/topics/${links.learningTopic.id}`}
            >
              {links.learningTopic.subject} — {links.learningTopic.title}
            </Link>
          )}
          {links.dsaTopic && (
            <span className="muted">Practice topic: {links.dsaTopic.name}</span>
          )}
        </p>
      )}
      <div className="pane-block">
        <b>{practice ? 'If stuck' : 'Then, with Silsila'}</b>
        <StudyHint />
        <div className="pane-tools">
          <StudyPrompt
            card
            title={
              practice ? 'Copy the pattern prompt' : 'Copy the study prompt'
            }
            roadmap={{ title: roadmap.title }}
            template={roadmap.promptTemplate}
            scenarios={scenarios}
            storageKey={`silsila-scenario:${roadmap.id}`}
            item={promptItem}
            onCopy={autoStart}
          />
          {grill && grillable && (
            <PanelButton
              panel={`grill:${item.id}`}
              className="pane-tool"
              data-grill-open
            >
              <b>Grill me</b>
              <span>
                {practice
                  ? 'Five questions on the pattern'
                  : 'Five questions on this item, kept as cards'}
              </span>
            </PanelButton>
          )}
          {grill && listenable && (
            <PanelButton
              panel={`listen:${item.id}`}
              className="pane-tool"
              data-listen-open
            >
              <b>Listen</b>
              <span>A spoken summary from the references</span>
            </PanelButton>
          )}
        </div>
      </div>
      <ActionForm
        action={noteAction}
        label={`Note for ${item.title}`}
        className="pane-note"
      >
        <input type="hidden" name="id" value={item.id} />
        <label>
          <b>My note</b>
          <textarea
            name="notes"
            rows={item.notes ? 3 : 1}
            maxLength={20000}
            defaultValue={item.notes ?? ''}
            placeholder="What tripped me up, a link, a reminder for next time"
            onFocus={(e) => {
              e.currentTarget.rows = 3;
            }}
            onBlur={(e) => {
              if (e.currentTarget.value !== (item.notes ?? ''))
                e.currentTarget.form?.requestSubmit();
            }}
          />
        </label>
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
                if (e.currentTarget.value !== (item.askedNote ?? ''))
                  e.currentTarget.form?.requestSubmit();
              }}
            />
          </label>
        </ActionForm>
      )}
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
                  <p className="muted kept-card-change">{c.change}</p>
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
      {/* Started by itself, quietly: the badge and the row icon are the only answer. */}
      <ActionForm
        action={itemOpAction}
        className="pane-autostart"
        onPending={(f) => flip(item.id, f)}
        onSettled={(r) => settle(item.id, r.ok)}
      >
        <input type="hidden" name="id" value={item.id} />
        <button ref={startRef} name="op" value="start" tabIndex={-1} hidden />
      </ActionForm>
      <ActionForm
        action={itemOpAction}
        broadcast="roadmap-items"
        className="item-foot-form"
        onPending={(f) => flip(item.id, f)}
        onSettled={(r) => settle(item.id, r.ok)}
      >
        <input type="hidden" name="id" value={item.id} />
        <div className="item-foot">
          {primary === 'attempt' && (
            <Link prefetch={false} className="button" href={practice!}>
              Record an attempt
            </Link>
          )}
          {primary === 'done' && (
            <button className="button" name="op" value="done">
              <Check size={15} aria-hidden="true" /> Mark done
            </button>
          )}
          {primary === 'revised' && (
            <button className="button" name="op" value="revised">
              <Check size={15} aria-hidden="true" /> Mark revised
            </button>
          )}
          {primary === 'is-done' && (
            <span className="status-badge is-on item-foot-done">
              <Check size={14} aria-hidden="true" /> Done
            </span>
          )}
          <button
            className={`button secondary small${item.askedInInterview ? ' is-pressed' : ''}`}
            name="op"
            value={item.askedInInterview ? 'unasked' : 'asked'}
            aria-pressed={item.askedInInterview}
          >
            Asked in an interview
          </button>
          <MoreMenu label={`More for ${item.title}`}>
            <PanelButton
              panel={`item-edit:${item.id}`}
              className="more-menu-item"
            >
              Edit
            </PanelButton>
            {!practice && status === 'DONE' && (
              <button className="more-menu-item" name="op" value="reopen">
                Reopen
              </button>
            )}
            {!practice && status === 'IN_PROGRESS' && (
              <button className="more-menu-item" name="op" value="unstart">
                Back to not started
              </button>
            )}
            <button className="more-menu-item danger" name="op" value="remove">
              Remove
            </button>
          </MoreMenu>
        </div>
      </ActionForm>
      <SidePanel id={`item-edit:${item.id}`} title={`Edit ${item.title}`}>
        <ItemForm item={item} sections={sections} />
      </SidePanel>
      {grill && grillable && (
        <SidePanel id={`grill:${item.id}`} title={`Grill me · ${item.title}`}>
          <GrillMe
            item={studyItem}
            budget={grill.budget}
            status={status}
            revisionDue={due}
          />
        </SidePanel>
      )}
      {grill && listenable && (
        <SidePanel id={`listen:${item.id}`} title={`Listen · ${item.title}`}>
          <Listen item={studyItem} budget={grill.budget} />
        </SidePanel>
      )}
    </div>
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
