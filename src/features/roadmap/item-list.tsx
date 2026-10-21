'use client';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Check,
  Circle,
  CircleCheck,
  CircleDot,
  ExternalLink,
} from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import type { RoadmapItem } from '@/generated/prisma/client';
import { itemOpAction, noteAction } from './actions';
import { ItemForm } from './item-form';
import { StudyPrompt } from './study-prompt';
import type { Reference, Scenario } from './domain';

export type RowLinks = {
  learningTopic: { id: string; title: string; subject: string } | null;
  dsaProblem: { id: string; title: string } | null;
  dsaTopic: { id: string; name: string } | null;
};
export type Row = {
  item: RoadmapItem;
  revision: 'none' | 'upcoming' | 'due' | 'overdue';
  /** "Oct 28" for the meta column; set when a revision is scheduled. */
  revisionLabel: string | null;
  links: RowLinks;
};

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const statusText = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
} as const;

function StatusIcon({ status }: { status: RoadmapItem['status'] }) {
  const common = { size: 18, 'aria-hidden': true as const, strokeWidth: 2 };
  if (status === 'DONE')
    return <CircleCheck {...common} className="item-icon is-done" />;
  if (status === 'IN_PROGRESS')
    return <CircleDot {...common} className="item-icon is-active" />;
  return <Circle {...common} className="item-icon" />;
}

/**
 * The section's items, one open at a time. A row is an icon, the title and a quiet meta
 * column; the open row carries the study material, a note, the prompt and the actions.
 */
export function ItemList({
  roadmap,
  scenarios,
  sections,
  rows,
  initialOpen,
}: {
  roadmap: { id: string; title: string; promptTemplate: string | null };
  scenarios: Scenario[];
  sections: string[];
  rows: Row[];
  initialOpen: string | null;
}) {
  // A link from Today or the overview names the item in the hash; until the owner clicks,
  // that item (else the Continue item) is the open one.
  const hashId = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.replace('#item-', ''),
    () => '',
  );
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState<string | null>(null);
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
  const toggle = (id: string) => {
    setChosen(open === id ? null : id);
    setEditing(null);
  };
  return (
    <ol className="plain-list item-list">
      {rows.map(({ item, revision, revisionLabel, links }) => {
        const isOpen = open === item.id;
        const references = (item.references as Reference[] | null) ?? [];
        const meta = [
          item.kind === 'QUESTION' && item.estimateMinutes
            ? `${item.estimateMinutes} min`
            : null,
          item.kind !== 'QUESTION' && item.estimateMinutes
            ? `${item.estimateMinutes} min`
            : null,
          revision === 'upcoming' && revisionLabel
            ? `Revise ${revisionLabel}`
            : null,
        ].filter(Boolean);
        return (
          <li
            key={item.id}
            id={`item-${item.id}`}
            className={`item-row is-${item.status.toLowerCase().replace('_', '-')}${isOpen ? ' is-open' : ''}`}
          >
            <StatusIcon status={item.status} />
            <button
              type="button"
              className="item-title"
              aria-expanded={isOpen}
              aria-controls={`panel-${item.id}`}
              onClick={() => toggle(item.id)}
              title={item.title}
            >
              <span className="sr-only">{statusText[item.status]}: </span>
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
                label={`Quick action for ${item.title}`}
                className="row-quick"
              >
                <input type="hidden" name="id" value={item.id} />
                {item.status === 'DONE' && item.nextRevisionAt ? (
                  <button
                    className="button secondary small"
                    name="op"
                    value="revised"
                    aria-label={`Revised: ${item.title}`}
                    title="Revised"
                  >
                    <Check size={14} aria-hidden="true" /> Revised
                  </button>
                ) : item.status !== 'DONE' ? (
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
                {item.scope && <p className="item-scope">{item.scope}</p>}
                {item.checkpoint && (
                  <p>
                    <strong>Done means.</strong> {item.checkpoint}
                  </p>
                )}
                {references.length > 0 && (
                  <ul className="plain-list reference-list">
                    {references.map((r) => (
                      <li key={r.url}>
                        <a
                          className="link"
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {r.label}
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                        {r.kind && <span className="muted"> · {r.kind}</span>}
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
                      <Link
                        className="link"
                        href={`/dsa/${links.dsaProblem.id}?from=${item.id}`}
                      >
                        Record an attempt
                      </Link>
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
                <ActionForm
                  action={noteAction}
                  label={`Note for ${item.title}`}
                  className="note-form"
                >
                  <input type="hidden" name="id" value={item.id} />
                  <label>
                    My note
                    <textarea
                      name="notes"
                      rows={2}
                      maxLength={20000}
                      defaultValue={item.notes ?? ''}
                      placeholder="What tripped me up, a link, a reminder for next time"
                    />
                  </label>
                  <button className="button secondary small">Save note</button>
                </ActionForm>
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
                  action={itemOpAction}
                  label={`Actions for ${item.title}`}
                >
                  <input type="hidden" name="id" value={item.id} />
                  <div className="item-actions">
                    {item.status === 'DONE' && item.nextRevisionAt ? (
                      <button
                        className="button small"
                        name="op"
                        value="revised"
                      >
                        <Check size={14} aria-hidden="true" /> Revised
                      </button>
                    ) : (
                      <button className="button small" name="op" value="done">
                        <Check size={14} aria-hidden="true" /> Done
                      </button>
                    )}
                    {item.status === 'NOT_STARTED' && (
                      <button
                        className="button secondary small"
                        name="op"
                        value="start"
                      >
                        Start
                      </button>
                    )}
                    {item.status === 'DONE' && (
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
                      {item.askedInInterview ? 'Asked ✓' : 'Asked in interview'}
                    </button>
                    <span className="item-actions-spacer" />
                    <button
                      type="button"
                      className="link-button"
                      aria-expanded={editing === item.id}
                      onClick={() =>
                        setEditing((e) => (e === item.id ? null : item.id))
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="link-button danger"
                      name="op"
                      value="remove"
                    >
                      Remove
                    </button>
                  </div>
                </ActionForm>
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
      {!rows.length && <li className="muted">Nothing matches here.</li>}
    </ol>
  );
}
