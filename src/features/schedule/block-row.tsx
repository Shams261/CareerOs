import type { ReactNode } from 'react';
import { Check, Circle, CircleDot, Pause } from 'lucide-react';
import type { Resolution } from './row';

/** The glyph beside a row's status word. */
export function StatusIcon({ resolution }: { resolution: string }) {
  if (resolution === 'done') return <Check size={15} aria-hidden="true" />;
  if (resolution === 'paused') return <Pause size={12} aria-hidden="true" />;
  if (resolution === 'current' || resolution === 'in-progress')
    return <CircleDot size={12} aria-hidden="true" />;
  if (resolution === 'not-recorded' || resolution === 'needs-update')
    return <Circle size={12} aria-hidden="true" />;
  return null;
}

/**
 * The row skeleton Today and Plan share: `time | dot | title + meta | status + side`.
 * Today passes its actions, Details button and panel through `side` and `children`; Plan
 * passes a link. The resolution picks the dot, the tint and the status colour.
 */
export function BlockRowShell({
  id,
  resolution,
  unresolved = false,
  justDone = false,
  time,
  icon,
  title,
  meta,
  status,
  statusTone,
  side,
  children,
}: {
  id?: string;
  resolution: Resolution;
  unresolved?: boolean;
  /** Completed in the last minute or two: the check draws in once (WI-059). */
  justDone?: boolean;
  time: ReactNode;
  icon: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  status: string;
  /** Today's timeline names an upcoming row "Up next" or "Planned" (WI-065); Plan keeps it quiet. */
  statusTone?: 'up-next' | 'planned';
  side?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li
      id={id}
      className={`agenda-row is-${resolution}${unresolved ? ' is-unresolved' : ''}${justDone ? ' is-just-done' : ''}`}
    >
      <span className="agenda-time">{time}</span>
      <span className="agenda-dot" aria-hidden="true" />
      <div className="agenda-body">
        <h3 className="agenda-title">
          {icon}
          {title}
        </h3>
        <p className="agenda-meta">{meta}</p>
      </div>
      <div className="agenda-side">
        <span className={`agenda-status is-${statusTone ?? resolution}`}>
          <StatusIcon resolution={resolution} />
          {status}
        </span>
        {side}
      </div>
      {children}
    </li>
  );
}
