import type { ReactNode } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');
/** "4:05" or "1:02:05" from milliseconds, never negative. */
export const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000)),
    h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** The ring: a track and an arc that fills as the session moves toward its target. */
export function Ring({
  fraction,
  size = 280,
  children,
}: {
  fraction: number | null;
  size?: number;
  children: ReactNode;
}) {
  const r = 46,
    c = 2 * Math.PI * r;
  return (
    <div className="focus-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="focus-ring-track" cx="50" cy="50" r={r} />
        {fraction !== null && (
          <circle
            className="focus-ring-arc"
            cx="50"
            cy="50"
            r={r}
            strokeDasharray={c}
            // The arc is the time left: it drains toward the target, then closes full.
            strokeDashoffset={fraction >= 1 ? 0 : c * fraction}
          />
        )}
      </svg>
      <div className="focus-ring-text">{children}</div>
    </div>
  );
}
