import Link from 'next/link';
import type { ScheduleUser } from '@/features/schedule/service';
import { formatInTimeZone } from 'date-fns-tz';
import { chainDays } from './service';

/** The last fourteen days as rings. Filled: recorded work; dot: reviewed. */
export async function Chain({ user, now }: { user: ScheduleUser; now: Date }) {
  const days = await chainDays(user, now);
  if (!days.some((d) => d.worked || d.reviewed)) return null;
  const active = days.filter((d) => d.worked || d.reviewed).length;
  return (
    <div className="chain-wrap">
      <ol
        className="chain"
        aria-label={`The chain: ${active} of the last ${days.length} days with recorded work or a review`}
      >
        {days.map((d) => {
          const text = `${formatInTimeZone(new Date(`${d.day}T12:00:00Z`), 'UTC', 'EEE MMM d')}${
            d.worked && d.reviewed
              ? ' · worked and reviewed'
              : d.worked
                ? ' · worked'
                : d.reviewed
                  ? ' · reviewed'
                  : ' · nothing recorded'
          }`;
          return (
            <li
              key={d.day}
              className={`chain-ring${d.worked ? ' is-worked' : ''}${d.reviewed ? ' is-reviewed' : ''}${d.today ? ' is-today' : ''}`}
              title={text}
            >
              <Link
                prefetch={false}
                href={`/today?date=${d.day}`}
                aria-label={text}
              />
            </li>
          );
        })}
      </ol>
      <span className="chain-caption" aria-hidden="true">
        {active} of the last {days.length} days with recorded work
      </span>
    </div>
  );
}
