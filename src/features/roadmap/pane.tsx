'use client';
import Link from 'next/link';
import { confidenceWord } from '@/features/dsa/words';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  adjacent,
  initialItem,
  kindBadge,
  linkTitle,
  openSections,
  primaryAction,
  problemFacts,
  scopeLines,
  statusBadge,
} from './pane-domain';
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
  /** The outline lists the row; search and Show hide the others, the pane can still show them. */
  shown: boolean;
  /** "Oct 28": the day the item was marked done, in the owner's zone (WI-085). */
  doneLabel: string | null;
};
export type Section = {
  name: string;
  total: number;
  done: number;
  due: number;
};

const statusText: Record<ItemStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'Studying',
  DONE: 'Done',
};
const tone = { RED: 'danger', YELLOW: 'warning', GREEN: 'success' } as const;
const PHONE = '(max-width: 700px)';

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function StatusIcon({ status, pop }: { status: ItemStatus; pop: boolean }) {
  const common = {
    size: 16,
    'aria-hidden': true as const,
    strokeWidth: 2,
    className: `item-icon${status === 'DONE' ? ' is-done' : status === 'IN_PROGRESS' ? ' is-active' : ''}${pop ? ' is-pop' : ''}`,
  };
  if (status === 'DONE') return <CircleCheck {...common} />;
  if (status === 'IN_PROGRESS') return <CircleDot {...common} />;
  return <Circle {...common} />;
}

/**
 * The roadmap as an outline and a reading pane (WI-084, the list-detail layout the field
 * research found in every learning app): the outline on the left lists every section with its
 * items, the open section expanded and the open item highlighted; the pane on the right shows
 * that one item in reading order with one status control and Prev / Next at its foot. On a phone
 * the outline is the page and a tapped item opens as its own screen.
 * Keys: J and K move along the outline, D marks done (or revised), C copies the prompt, Esc
 * goes back to the outline.
 */
export function RoadmapPane({
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
  sections: Section[];
  rows: Row[];
  /** The Continue item, shown on arrival when no link named another. */
  next: string | null;
  /** The section a link asked for (`?section=`): opened in the outline, its first open item shown. */
  section: string | null;
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
  // The open item is picked once on arrival and then only by the owner, a link or the command
  // bar: a mark never moves the pane, even when the server's Continue item changes with it.
  const [open, setOpen] = useState<string | null>(() =>
    initialItem(paneRows, { hash: hashId || null, section, next }),
  );
  // On a phone the pane is its own screen only once the owner chose an item or a link named one.
  const [explicit, setExplicit] = useState(false);
  // A new hash (a link, or the command bar on this same page) wins over an earlier click.
  const [seenHash, setSeenHash] = useState(hashId);
  if (hashId !== seenHash) {
    setSeenHash(hashId);
    if (hashId && rows.some((r) => r.item.id === hashId)) {
      setOpen(hashId);
      setExplicit(true);
    }
  }
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (rows.some((r) => r.item.id === id)) {
        setOpen(id);
        setExplicit(true);
      }
    };
    window.addEventListener(OPEN_ITEM_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ITEM_EVENT, onOpen);
  }, [rows]);
  // The outline's open sections: the open item's and the link's on arrival, then as toggled.
  const [opened, setOpened] = useState<string[] | null>(null);
  const openedNow =
    opened ?? openSections(paneRows, { openId: open, section, q });
  const current = rows.find((r) => r.item.id === open) ?? null;
  const show = (id: string) => {
    setOpen(id);
    setExplicit(true);
    const s = rows.find((r) => r.item.id === id)?.item.section;
    if (s && !openedNow.includes(s)) setOpened([...openedNow, s]);
  };
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`outline-${open}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  // The pane starts at its top when another item opens, so the title is what shows first.
  const paneRef = useRef<HTMLElement>(null);
  const lastOpen = useRef(open);
  useEffect(() => {
    if (lastOpen.current === open) return;
    lastOpen.current = open;
    const pane = paneRef.current;
    if (!pane) return;
    if (window.matchMedia(PHONE).matches) pane.scrollTo({ top: 0 });
    else if (pane.getBoundingClientRect().top < 0)
      pane.scrollIntoView({ block: 'start' });
  }, [open]);
  // The icon pops once when an item turns done while the page is open.
  const statuses = useRef(new Map(rows.map((r) => [r.item.id, r.item.status])));
  const [popped, setPopped] = useState<string | null>(null);
  // Optimistic marks (WI-017): the outline and the control flip as soon as a choice is made
  // and reconcile with the server's rows; a failed action puts them back.
  const [optimistic, setOptimistic] = useState<Map<string, ItemStatus>>(
    new Map(),
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
  const outlineRef = useRef<HTMLElement>(null);
  const titles = () => [
    ...(outlineRef.current?.querySelectorAll<HTMLButtonElement>(
      '.outline-title',
    ) ?? []),
  ];
  const move = (delta: 1 | -1) => {
    const all = titles();
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
  const pressInPane = (selector: string) =>
    paneRef.current?.querySelector<HTMLElement>(selector)?.click();
  const { prev, next: after } = adjacent(paneRows, open);
  const sectionOf = (name: string) =>
    sections.find((s) => s.name === name) ?? null;
  return (
    <div
      className={`roadmap-pane-layout${explicit ? ' is-explicit' : ''}${!rows.some((r) => r.shown) ? ' is-empty' : ''}`}
    >
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
            pressInPane('button[value="revised"], button[value="done"]')
          }
        />
        <button
          type="button"
          data-shortcut="row-copy"
          tabIndex={-1}
          onClick={() => {
            const focused = document.activeElement as HTMLElement | null;
            const id =
              focused?.closest<HTMLElement>('.outline-title')?.dataset.item;
            if (id && id !== open) show(id);
            setTimeout(() => pressInPane('.study-prompt button'), 50);
          }}
        />
        <button
          type="button"
          data-shortcut="row-grill"
          tabIndex={-1}
          onClick={() => pressInPane('[data-grill-open]')}
        />
        <button
          type="button"
          data-shortcut="row-close"
          tabIndex={-1}
          onClick={() => {
            titles()
              .find((b) => b.dataset.item === open)
              ?.focus();
            // On a phone the item is its own screen; Escape goes back to the outline.
            if (window.matchMedia(PHONE).matches) setExplicit(false);
          }}
        />
      </span>
      <nav className="roadmap-outline" aria-label="Items" ref={outlineRef}>
        {sections.map((s) => {
          const inSection = rows.filter(
            (r) => r.item.section === s.name && r.shown,
          );
          const isOpen = openedNow.includes(s.name);
          const headingId = `outline-section-${s.name.replace(/\W+/g, '-')}`;
          return (
            <section
              key={s.name}
              className={`outline-section${isOpen ? ' is-open' : ''}`}
              aria-labelledby={headingId}
            >
              <h2 className="outline-heading">
                <button
                  type="button"
                  id={headingId}
                  className="outline-section-toggle"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpened(
                      isOpen
                        ? openedNow.filter((n) => n !== s.name)
                        : [...openedNow, s.name],
                    )
                  }
                >
                  <span className="outline-section-name">{s.name}</span>
                  <span className="outline-section-count">
                    {s.due > 0 && (
                      <span className="outline-due">{s.due} due</span>
                    )}
                    {s.done} / {s.total}
                    <ChevronDown
                      size={14}
                      aria-hidden="true"
                      className="outline-chevron"
                    />
                  </span>
                </button>
              </h2>
              {isOpen && (
                <ol className="plain-list outline-items">
                  {inSection.map((r) => {
                    const status = statusOf(r);
                    const isCurrent = open === r.item.id;
                    return (
                      <li
                        key={r.item.id}
                        id={`outline-${r.item.id}`}
                        className={`outline-row is-${status.toLowerCase().replace('_', '-')}${isCurrent ? ' is-current' : ''}`}
                      >
                        <StatusIcon
                          status={status}
                          pop={popped === r.item.id}
                        />
                        <button
                          type="button"
                          className="outline-title"
                          data-item={r.item.id}
                          aria-current={isCurrent ? 'true' : undefined}
                          onClick={() => show(r.item.id)}
                          title={r.item.title}
                        >
                          <span className="sr-only">
                            {statusText[status]}:{' '}
                          </span>
                          {r.item.title}
                          {r.item.priority === 1 && (
                            <span className="pill priority">P0</span>
                          )}
                        </button>
                        <span className="outline-meta">
                          {r.revision === 'due' || r.revision === 'overdue' ? (
                            <span
                              className={`pill ${r.revision === 'due' ? 'warning' : 'danger'}`}
                              title={r.revisionText ?? undefined}
                            >
                              Due
                            </span>
                          ) : r.item.estimateMinutes ? (
                            `${r.item.estimateMinutes} min`
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                  {!inSection.length && (
                    <li className="outline-row muted">
                      {q ? 'No match here' : 'Nothing here'}
                    </li>
                  )}
                </ol>
              )}
            </section>
          );
        })}
        {!rows.some((r) => r.shown) && (
          <p className="muted outline-empty">
            {q ? `Nothing matches “${q}”.` : 'Nothing matches here.'}
          </p>
        )}
      </nav>
      <article
        className="item-pane"
        ref={paneRef}
        aria-labelledby={current ? `pane-title-${current.item.id}` : undefined}
        aria-label={current ? undefined : 'Item'}
      >
        <FeedbackOutlet channel="roadmap-items" className="mb-3" />
        {current ? (
          <ItemPane
            key={current.item.id}
            row={current}
            status={statusOf(current)}
            roadmap={roadmap}
            scenarios={scenarios}
            sections={sections.map((s) => s.name)}
            sectionCount={sectionOf(current.item.section)}
            position={
              rows
                .filter((r) => r.item.section === current.item.section)
                .findIndex((r) => r.item.id === current.item.id) + 1
            }
            grill={grill}
            flip={flip}
            settle={settle}
            back={() => setExplicit(false)}
            prev={prev ? rows.find((r) => r.item.id === prev.id)! : null}
            next={after ? rows.find((r) => r.item.id === after.id)! : null}
            go={show}
          />
        ) : (
          <p className="muted">
            {q ? 'Nothing matches the search.' : 'Choose an item.'}
          </p>
        )}
      </article>
    </div>
  );
}

/**
 * One item as a task card (WI-085): where it sits, the title with its status badge, the goal
 * (Done when) first, the scope as bullets, the references as rows to study from, the three study
 * tools as cards, the note always present, and one foot with one primary action for the state
 * (Mark done, Mark revised, Record an attempt), the interview mark, ⋯ and Prev / Next. A
 * problem-linked item shows the problem card instead: its facts, Open on LeetCode, Record an
 * attempt. The status is shown, never chosen: copying the prompt or opening a reference starts
 * an item by itself.
 */
function ItemPane({
  row,
  status,
  roadmap,
  scenarios,
  sections,
  sectionCount,
  position,
  grill,
  flip,
  settle,
  back,
  prev,
  next,
  go,
}: {
  row: Row;
  status: ItemStatus;
  roadmap: { id: string; title: string; promptTemplate: string | null };
  scenarios: Scenario[];
  sections: string[];
  sectionCount: Section | null;
  position: number;
  grill: { budget: string } | null;
  flip: (id: string, f: FormData) => void;
  settle: (id: string, ok: boolean | undefined) => void;
  back: () => void;
  prev: Row | null;
  next: Row | null;
  go: (id: string) => void;
}) {
  const {
    item,
    revision,
    revisionText,
    revisionLabel,
    doneLabel,
    links,
    cards,
    grillable,
    listenable,
  } = row;
  const references = (item.references as Reference[] | null) ?? [];
  // A problem item follows Practice (WI-046): its marks come from attempts there.
  const practice = links.dsaProblem
    ? `/dsa/${links.dsaProblem.id}?from=${item.id}`
    : null;
  const due = revision === 'due' || revision === 'overdue';
  const badge = statusBadge({
    status,
    revision,
    revisionText,
    doneLabel,
    revisionLabel,
  });
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
  return (
    <>
      <p className="item-pane-where">
        <button
          type="button"
          className="link-button item-pane-back"
          onClick={back}
        >
          <ArrowLeft size={14} aria-hidden="true" /> {item.section}
        </button>
        <span className="item-pane-crumb">
          {item.section}
          {sectionCount ? ` · ${position} of ${sectionCount.total}` : ''}
        </span>
      </p>
      <h2 className="item-pane-title" id={`pane-title-${item.id}`}>
        {item.title}
      </h2>
      <p className="item-metaline">
        <span className={`status-badge is-${badge.tone}`}>{badge.text}</span>
        {item.priority === 1 && <span className="pill priority">P0</span>}
        {item.askedInInterview && (
          <span className="pill success">Asked in an interview</span>
        )}
        {facts?.difficulty && <span>{facts.difficulty}</span>}
        {estimate && <span>{estimate}</span>}
        {!practice && status !== 'DONE' && (
          <span className="muted">Revision 7 days after done</span>
        )}
      </p>
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
      <ActionForm
        action={itemOpAction}
        broadcast="roadmap-items"
        className="item-foot-form"
        onPending={(f) => flip(item.id, f)}
        onSettled={(r) => settle(item.id, r.ok)}
      >
        <input type="hidden" name="id" value={item.id} />
        <span hidden>
          <button ref={startRef} name="op" value="start" tabIndex={-1} />
        </span>
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
          <span className="item-foot-nav">
            {prev ? (
              <Button
                type="button"
                variant="secondary"
                className="small"
                onClick={() => go(prev.item.id)}
                aria-label={`Prev: ${prev.item.title}`}
              >
                <ChevronLeft size={14} aria-hidden="true" /> Prev
              </Button>
            ) : null}
            {next ? (
              <Button
                type="button"
                variant="secondary"
                className="small item-foot-next"
                onClick={() => go(next.item.id)}
                title={`Next: ${next.item.title}`}
              >
                <span className="item-foot-next-label">
                  Next: {next.item.title}
                </span>
                <ChevronRight size={14} aria-hidden="true" />
              </Button>
            ) : null}
          </span>
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
