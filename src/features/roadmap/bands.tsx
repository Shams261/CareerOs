'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { ChevronDown, ChevronRight, Route } from 'lucide-react';
import { PanelButton } from '@/components/side-panel';

export type BandSection = {
  name: string;
  total: number;
  done: number;
  due: number;
};
export type Band = {
  id: string;
  title: string;
  done: number;
  total: number;
  due: number;
  /** The section holding the Continue item: marked Current, with the item's title. */
  current: string | null;
  nextTitle: string | null;
  sections: BandSection[];
};

const OPEN_KEY = 'silsila-roadmap-open';
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY);
  } catch {
    return null;
  }
}
function writeOpen(id: string | null) {
  try {
    if (id) localStorage.setItem(OPEN_KEY, id);
    else localStorage.removeItem(OPEN_KEY);
  } catch {
    /* storage unavailable: the band still opens for this view */
  }
  listeners.forEach((l) => l());
}

/**
 * The roadmaps as bands that open to their sections (WI-088, the shape of Practice's pattern
 * bands): one roadmap open at a time, remembered in this browser so Back from a week lands on
 * the open band. A section row is a link to its page; the current section (the one holding the
 * Continue item) is marked and names its next item; the last row adds items to the roadmap.
 */
export function RoadmapBands({ roadmaps }: { roadmaps: Band[] }) {
  const remembered = useSyncExternalStore(subscribe, readOpen, () => null);
  const open = roadmaps.some((r) => r.id === remembered) ? remembered : null;
  return (
    <ul className="plain-list roadmap-bands">
      {roadmaps.map((r) => {
        const isOpen = open === r.id;
        const left = r.total - r.done;
        const listId = `roadmap-sections-${r.id}`;
        return (
          <li key={r.id} className={`roadmap-band${isOpen ? ' is-open' : ''}`}>
            <h3 className="roadmap-band-head">
              <button
                type="button"
                className="roadmap-band-toggle"
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => writeOpen(isOpen ? null : r.id)}
              >
                <span className="roadmap-band-icon" aria-hidden="true">
                  <Route size={20} />
                </span>
                <span className="roadmap-band-name">{r.title}</span>
                <span className="roadmap-band-counts">
                  {r.total > 0 ? (
                    <span>
                      {r.done} done · {left} left
                    </span>
                  ) : (
                    <span>No items yet</span>
                  )}
                  {r.due > 0 && <span className="is-due">{r.due} due</span>}
                </span>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className="roadmap-band-chevron"
                />
              </button>
            </h3>
            <div id={listId} hidden={!isOpen}>
              {isOpen && (
                <ol className="plain-list band-sections">
                  {r.sections.map((s) => {
                    const isCurrent = s.name === r.current;
                    return (
                      <li
                        key={s.name}
                        className={`band-section${isCurrent ? ' is-current' : ''}`}
                      >
                        <Link
                          prefetch={false}
                          className="band-section-link"
                          href={`/roadmap/${r.id}?section=${encodeURIComponent(s.name)}`}
                        >
                          <span className="band-section-name">
                            <span className="band-section-text">
                              {s.name}
                              {isCurrent && (
                                <span className="pill priority band-section-current">
                                  Current
                                </span>
                              )}
                            </span>
                            {isCurrent && r.nextTitle && (
                              <small>Next: {r.nextTitle}</small>
                            )}
                          </span>
                          <span className="band-section-count">
                            {s.due > 0 && (
                              <span className="is-due">{s.due} due</span>
                            )}
                            {s.done > 0
                              ? `${s.done} of ${s.total} done`
                              : `0 of ${s.total}`}
                          </span>
                          <ChevronRight
                            size={18}
                            aria-hidden="true"
                            className="band-section-chevron"
                          />
                        </Link>
                      </li>
                    );
                  })}
                  <li className="band-section band-section-add">
                    <PanelButton
                      panel={`add-items:${r.id}`}
                      className="link-button band-section-add-button"
                    >
                      + Add a week or items to {r.title}
                    </PanelButton>
                  </li>
                </ol>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
