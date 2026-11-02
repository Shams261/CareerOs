import { formatInTimeZone } from 'date-fns-tz';
import { TodayHeader } from '../header';
import { PanelButton } from '../panels';
import { headerLine } from '../home';
import { dayPart } from '../daily-line';
import { targetLabel } from '@/features/roadmap/domain';
import type { TodayView } from '../page-data';

/** Today's header with its facts, the cheer, the goal chip and the daily line (WI-065, WI-073). */
export function TodayHead({ v }: { v: TodayView }) {
  const {
    user,
    now,
    today,
    day,
    bounds,
    isToday,
    summary,
    running,
    notes,
    reviewed,
    closing,
    plan,
    nearestGoal,
  } = v;
  return (
    <TodayHeader
      day={day}
      today={today}
      zone={user.timezone}
      bounds={bounds}
      summary={summary}
      running={!!running}
      renderedAt={now.toISOString()}
      noteCount={notes.length}
      reviewed={day > today ? null : reviewed}
      closing={closing}
      rested={!!plan?.restAt}
      cheer={
        isToday
          ? headerLine({
              completed: summary.completed,
              planned: summary.planned,
              day,
            })
          : ''
      }
      goalChip={
        isToday ? (
          <PanelButton panel="goal" className="today-fact-button">
            {nearestGoal ? (
              <>
                <strong>
                  {targetLabel(
                    nearestGoal.targetDate?.toISOString().slice(0, 10) ?? null,
                    today,
                  ).replace(/ left$/, '')}
                </strong>{' '}
                to your goal
              </>
            ) : (
              <strong>Set a goal</strong>
            )}
          </PanelButton>
        ) : null
      }
      daily={
        isToday
          ? {
              part: dayPart(Number(formatInTimeZone(now, user.timezone, 'H'))),
              name: user.name,
            }
          : null
      }
      goalAction={
        isToday ? (
          <PanelButton panel="goal" className="link-button today-util">
            {nearestGoal ? 'Edit goal' : 'Set a goal'}
          </PanelButton>
        ) : null
      }
    />
  );
}
