import { Suspense } from 'react';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { hhmm } from '@/lib/time';
import { ReviewForm } from '@/features/schedule/forms';
import { Chain } from '@/features/roadmap/summary';
import { CaptureForm, NoteList } from '@/features/notes/forms';
import { CloseDayForm } from '@/features/close-day/form';
import { SidePanel } from '../panels';
import { summaryLine } from '../domain';
import type { TodayView } from '../page-data';

/** The panels Today opens on demand: review or Close the day, Activity, and Notes to self. */
export function DayPanels({ v }: { v: TodayView }) {
  const {
    user,
    now,
    day,
    today,
    isToday,
    running,
    closing,
    preview,
    reviewed,
    blocks,
    rounds,
    summary,
    plan,
    notes,
  } = v;
  return (
    <>
      {day <= today && (
        <SidePanel
          id="review"
          title={
            closing ? 'Close the day' : reviewed ? 'Edit review' : 'Review day'
          }

          variant="modal"
        >
          {/* Closing the day while a session runs would leave it open (WI-066). */}
          {running && (
            <p className="form-message" role="status">
              A session is still running. Pause or complete it before you close
              the day.
            </p>
          )}
          {closing && preview ? (
            <CloseDayForm
              day={day}
              zone={user.timezone}
              now={now}
              blocks={blocks}
              rounds={rounds}
              summary={summaryLine(summary)}
              note={plan?.checkIn?.notes ?? ''}
              rested={!!plan?.restAt}
              running={!!running}
              target={preview.target}
              slots={preview.slots}
              isToday={isToday}
            />
          ) : (
            <>
              <p className="muted">{summaryLine(summary)}</p>
              {reviewed && plan?.checkIn && (
                <p className="muted">
                  Reviewed
                  {plan.checkIn.completedAt
                    ? ` · ${hhmm(plan.checkIn.completedAt, user.timezone)}`
                    : ''}
                </p>
              )}
              <ReviewForm day={day} review={plan?.checkIn} />
            </>
          )}
        </SidePanel>
      )}
      {isToday && (
        <SidePanel id="activity" title="Activity">
          <p className="muted">
            The last fourteen days: a ring fills when work was recorded, a dot
            marks a reviewed day. Open a day to see it.
          </p>
          <Suspense fallback={null}>
            <Chain user={user} now={now} />
          </Suspense>
        </SidePanel>
      )}
      {isToday && (
        <SidePanel
          id="notes"
          title={
            notes.length ? `Notes to self · ${notes.length}` : 'Notes to self'
          }
        >
          {/* The note field left the sidebar (WI-063); notes are written here or from ⌘K. */}
          <CaptureForm />
          <FeedbackOutlet channel="notes" className="mb-3" />
          {notes.length ? (
            <NoteList notes={notes} />
          ) : (
            <p className="muted">
              Nothing waiting. ⌘K → Add a note works anywhere.
            </p>
          )}
        </SidePanel>
      )}
    </>
  );
}
