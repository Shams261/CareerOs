'use client';
import { useEffect, useState } from 'react';
import { HEIGHT, WIDTH, type DayPrintModel } from './domain';

/**
 * Today's rings, live (WI-071): the Day Print's chain of rings while the day is still open,
 * one per recorded session, growing as the day goes. A ring the tab has not shown before
 * draws itself in once; reduced motion shows it at once. It is the record, never a score.
 */
export function LivePrint({
  model,
  day,
}: {
  model: DayPrintModel;
  day: string;
}) {
  // Until the first frame every ring is "seen", so the first paint matches the server's.
  const [seen, setSeen] = useState(model.rings.length);
  useEffect(() => {
    const key = `silsila-rings:${day}`;
    let last = model.rings.length;
    try {
      const kept = sessionStorage.getItem(key);
      if (kept !== null) last = Number(kept);
      sessionStorage.setItem(key, String(model.rings.length));
    } catch {
      /* no storage: the rings show at once */
    }
    const frame = requestAnimationFrame(() =>
      setSeen(Math.min(last, model.rings.length)),
    );
    return () => cancelAnimationFrame(frame);
  }, [model.rings.length, day]);
  const id = `live-print-${day}`;
  return (
    <section className="card live-print" aria-labelledby={`${id}-heading`}>
      <div className="week-card-head">
        <h2 id={`${id}-heading`}>Today so far</h2>
        <span className="muted">
          {model.rings.length} session{model.rings.length === 1 ? '' : 's'}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT - 60}`}
        role="img"
        aria-label={`${model.headline} ${model.detail}`}
        className="live-print-svg"
      >
        {model.rings.map((r, i) => {
          const c = 2 * Math.PI * r.r;
          return (
            <circle
              key={i}
              cx={r.cx}
              cy={r.cy}
              r={r.r}
              fill="none"
              stroke={r.colour}
              strokeWidth={Math.max(5, r.r * 0.16)}
              className={i >= seen ? 'is-new' : undefined}
              style={
                i >= seen
                  ? ({
                      '--c': c,
                      '--delay': `${(i - seen) * 160}ms`,
                    } as React.CSSProperties)
                  : undefined
              }
              strokeDasharray={i >= seen ? c : undefined}
              transform={`rotate(-90 ${r.cx} ${r.cy})`}
            />
          );
        })}
      </svg>
      <p className="week-line">{model.headline}</p>
    </section>
  );
}
