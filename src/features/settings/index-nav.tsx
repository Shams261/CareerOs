'use client';
import { useEffect, useState } from 'react';

/**
 * The left index of Settings (WI-018): one link per group, the group in view marked as
 * current. On phones it is a row of pills above the groups.
 */
export function SettingsIndex({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        const top = sections.find((s) => visible.has(s.id));
        if (top) setCurrent(top.id);
      },
      { rootMargin: '-10% 0px -60% 0px', threshold: [0, 0.2, 0.5] },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);
  return (
    <nav className="settings-index" aria-label="Settings sections">
      <ul className="plain-list">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={current === s.id ? 'is-on' : ''}
              aria-current={current === s.id ? 'location' : undefined}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
