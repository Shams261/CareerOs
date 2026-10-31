'use client';
import Link from 'next/link';
import { confidenceWord } from './words';
import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';

export type GroupRow = {
  id: string;
  title: string;
  more: boolean;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  url: string | null;
  /** "LeetCode": names the link at the row's end (WI-091). */
  platform: string;
  confidence: 'RED' | 'YELLOW' | 'GREEN';
  attempted: boolean;
  /** 'due' | 'overdue' | 'upcoming' | null, with the date label for the last two. */
  revision: { state: 'due' | 'overdue' | 'upcoming'; label: string } | null;
};
export type Group = {
  id: string;
  name: string;
  /** The one platform every problem of the band is on, named once there (WI-093). */
  platform: string | null;
  current: boolean;
  attempted: number;
  due: number;
  rows: GroupRow[];
};

const tone = { RED: 'danger', YELLOW: 'warning', GREEN: 'success' } as const;
const level = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' } as const;

/**
 * Patterns as bands that open to their problems; the open set starts from `openIds`. A closed
 * band is a plain row and only the open one is tinted (WI-093); the rows carry the title, the
 * difficulty in meta ink, the confidence and the due state, and the platform as an icon.
 */
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
    <div className="problem-table">
      {groups.map((g) => {
        const isOpen = open.has(g.id);
        return (
          <div key={g.id} className="problem-group">
            <button
              type="button"
              className={`pattern-band${isOpen ? ' is-open' : ''}${g.current ? ' is-current' : ''}`}
              aria-expanded={isOpen}
              aria-controls={`pattern-${g.id}`}
              onClick={() => toggle(g.id)}
            >
              <span className="pattern-band-name">
                {g.name}
                {g.platform && (
                  <span className="pattern-band-platform">{g.platform}</span>
                )}
              </span>
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
                <div key={p.id} className="problem-line">
                  {/* The title's link reaches over the whole row (WI-091); the platform link at
                      the row's end sits above it. */}
                  <span className="problem-cell-title">
                    <Link
                      prefetch={false}
                      className="problem-title"
                      href={`/dsa/${p.id}`}
                    >
                      {p.title}
                    </Link>
                    {p.more && (
                      <span className="muted problem-tag">more practice</span>
                    )}
                  </span>
                  {/* One meta line on a phone, two columns on a desktop (WI-093). */}
                  <span className="problem-cell-meta">
                    <span className="problem-cell-level">
                      {level[p.difficulty]}
                    </span>
                    <span className="problem-cell-status">
                      <span
                        className={`pill ${p.attempted ? tone[p.confidence] : ''}`}
                      >
                        {p.attempted
                          ? confidenceWord(p.confidence)
                          : 'Unattempted'}
                      </span>
                      {p.revision?.state === 'overdue' && (
                        <span className="problem-date is-overdue">
                          Overdue {p.revision.label}
                        </span>
                      )}
                      {p.revision?.state === 'due' && (
                        <span className="problem-date is-due">Due today</span>
                      )}
                      {p.revision?.state === 'upcoming' && (
                        <span className="problem-date">{p.revision.label}</span>
                      )}
                    </span>
                  </span>
                  <span className="problem-cell-open">
                    {p.url && (
                      <a
                        className="problem-open"
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${p.title} on ${p.platform}`}
                        title={`Open on ${p.platform}`}
                      >
                        <ExternalLink size={15} aria-hidden="true" />
                      </a>
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
