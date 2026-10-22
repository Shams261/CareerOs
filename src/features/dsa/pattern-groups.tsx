'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';

export type GroupRow = {
  id: string;
  title: string;
  more: boolean;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  url: string | null;
  confidence: 'RED' | 'YELLOW' | 'GREEN';
  attempted: boolean;
  /** 'due' | 'overdue' | 'upcoming' | null, with the date label for the last two. */
  revision: { state: 'due' | 'overdue' | 'upcoming'; label: string } | null;
};
export type Group = {
  id: string;
  name: string;
  current: boolean;
  attempted: number;
  due: number;
  rows: GroupRow[];
};

const tone = { RED: 'danger', YELLOW: 'warning', GREEN: 'success' } as const;
const level = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' } as const;

/** Patterns as bands that open to their problems; the open set starts from `openIds`. */
export function PatternGroups({
  groups,
  openIds,
}: {
  groups: Group[];
  openIds: string[];
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(openIds));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div
      className="problem-table"
      role="table"
      aria-label="Problems by pattern"
    >
      <div className="problem-head" role="row">
        <span role="columnheader">Problem</span>
        <span role="columnheader">Pattern</span>
        <span role="columnheader">Complexity</span>
        <span role="columnheader">Status</span>
      </div>
      {groups.map((g) => {
        const isOpen = open.has(g.id);
        return (
          <div key={g.id} className="problem-group" role="rowgroup">
            <button
              type="button"
              className={`pattern-band${isOpen ? ' is-open' : ''}${g.current ? ' is-current' : ''}`}
              aria-expanded={isOpen}
              aria-controls={`pattern-${g.id}`}
              onClick={() => toggle(g.id)}
            >
              <span className="pattern-band-name">{g.name}</span>
              <span className="pattern-band-meta">
                {g.attempted} of {g.rows.length} attempted
                {g.due > 0 && <span className="pill warning">{g.due} due</span>}
                {g.current && <span className="pill success">Current</span>}
              </span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className="pattern-band-chevron"
              />
            </button>
            <div
              id={`pattern-${g.id}`}
              className="problem-group-rows"
              hidden={!isOpen}
            >
              {g.rows.map((p) => (
                <div key={p.id} className="problem-line" role="row">
                  <span role="cell" className="problem-cell-title">
                    <Link className="problem-title" href={`/dsa/${p.id}`}>
                      {p.title}
                    </Link>
                    {p.more && (
                      <span className="muted problem-tag">more practice</span>
                    )}
                    {p.url && (
                      <a
                        className="problem-open"
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${p.title} in a new tab`}
                        title="Open the problem in a new tab"
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    )}
                  </span>
                  <span role="cell" className="muted problem-cell-pattern">
                    {g.name}
                  </span>
                  <span
                    role="cell"
                    className={`problem-cell-level is-${p.difficulty.toLowerCase()}`}
                  >
                    {level[p.difficulty]}
                  </span>
                  <span role="cell" className="problem-cell-status">
                    <span
                      className={`pill ${p.attempted ? tone[p.confidence] : ''}`}
                    >
                      {p.attempted ? p.confidence : 'Unattempted'}
                    </span>
                    {p.revision?.state === 'overdue' && (
                      <span className="problem-date is-overdue">
                        overdue · {p.revision.label}
                      </span>
                    )}
                    {p.revision?.state === 'due' && (
                      <span className="problem-date is-due">due today</span>
                    )}
                    {p.revision?.state === 'upcoming' && (
                      <span className="problem-date">{p.revision.label}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
