import Link from 'next/link';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { shortDate } from '@/lib/time';
import type { Cell, Moment, monthFacts } from './domain';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function DayCell({ cell }: { cell: Cell }) {
  const art = (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="season-art">
      {cell.rings.length
        ? cell.rings.map((r, i) => (
            <circle
              key={i}
              cx={r.cx}
              cy={r.cy}
              r={r.r}
              fill="none"
              stroke={r.colour}
              strokeWidth={r.w}
            />
          ))
        : cell.rested && (
            <circle
              cx="50"
              cy="50"
              r="17"
              fill="none"
              stroke="#BEB7AA"
              strokeWidth="1.6"
            />
          )}
    </svg>
  );
  const cls = `season-cell${cell.isToday ? ' is-today' : ''}${cell.future ? ' is-future' : ''}`;
  if (cell.future)
    return (
      <td className={cls} aria-label={cell.label}>
        {art}
      </td>
    );
  return (
    <td className={cls}>
      <Link
        href={`/today?date=${cell.day}`}
        aria-label={cell.label}
        prefetch={false}
      >
        {art}
      </Link>
    </td>
  );
}

/** The season as weeks of small day prints; each past day opens on Today. */
export function SeasonGrid({ weeks }: { weeks: Cell[][] }) {
  return (
    <table className="season-grid">
      <caption className="sr-only">Your season, one square per day</caption>
      <thead>
        <tr>
          {WEEKDAYS.map((d, i) => (
            <th key={i} scope="col">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0].day}>
            {week.map((cell) => (
              <DayCell key={cell.day} cell={cell} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The latest moment, with every moment one click away. */
export function MomentCard({ moments }: { moments: Moment[] }) {
  const latest = moments[0];
  if (!latest) return null;
  return (
    <section className="moment-card" aria-labelledby="moment-latest">
      <p className="eyebrow">Moment · {shortDate(latest.day)}</p>
      <h2 id="moment-latest">{latest.title}</h2>
      <p>{latest.line}</p>
      {moments.length > 1 && (
        <PanelButton panel="moments" className="button secondary small">
          All moments · {moments.length}
        </PanelButton>
      )}
      <SidePanel id="moments" title={`Moments · ${moments.length}`}>
        <ol className="plain-list moment-list">
          {moments.map((m) => (
            <li key={m.key}>
              <p className="eyebrow">{shortDate(m.day)}</p>
              <p className="moment-title">{m.title}</p>
              <p className="muted">{m.line}</p>
            </li>
          ))}
        </ol>
      </SidePanel>
    </section>
  );
}

export function MonthCard({ month }: { month: ReturnType<typeof monthFacts> }) {
  return (
    <section className="month-card" aria-labelledby="month-heading">
      <p className="eyebrow">{month.month} so far</p>
      <h2 id="month-heading">{month.headline}</h2>
      {month.lines.length > 0 && (
        <ul className="month-lines">
          {month.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
