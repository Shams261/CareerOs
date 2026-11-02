import { RumiPose } from '@/features/agent/pose';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowRight, CalendarClock, Check, Circle, Plus } from 'lucide-react';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { formatInTimeZone } from 'date-fns-tz';
import type { ScheduleUser } from '@/server/lock';
import { BlockForm, RoutineForm } from '@/features/schedule/forms';
import { ROUTINE_TEMPLATES } from '@/features/schedule/templates';
import { GoalForm } from '@/features/roadmap/forms';
import { hideFirstStepsAction } from './actions';
import { FIRST_STEPS_COOKIE } from './first-steps-cookie';
import { firstSteps } from './home';
import { nextSlot } from './domain';
import { dayPart } from './daily-line';
import { DailyLine } from './daily-line-card';
import { PanelButton, SidePanel } from './panels';
import { hasLearningFocus } from './reads';
import { cn } from '@/lib/utils';

/**
 * Today for an empty account (WI-065, ADR-027): one welcoming action, three optional steps
 * and a calm empty day. Nothing is required: Plan my first focus opens the block form (WI-072)
 * and the steps (goal, study times, a learning focus) open in panels. The 20-minute pick under
 * it left with the For today picks (WI-092).
 */
export async function FirstRunToday({
  user,
  day,
  bounds,
  goals,
  name = null,
}: {
  user: ScheduleUser;
  day: string;
  bounds: { start: Date };
  goals: { id: string; title: string; status: string }[];
  /** The owner's name, for the greeting (WI-073). */
  name?: string | null;
}) {
  const [hidden, focus] = await Promise.all([
    cookies().then((c) => !!c.get(FIRST_STEPS_COOKIE)),
    // A learning focus: any roadmap item or practice problem the owner has begun.
    hasLearningFocus(user),
  ]);
  const { steps, done } = firstSteps({
    hasGoal: goals.some((g) => g.status === 'ACTIVE'),
    hasRoutine: false,
    hasFocus: focus,
  });
  // A new block starts at the next quarter hour, never at a time already gone (WI-066).
  const slot = nextSlot(new Date(), user.timezone, day);
  const part = dayPart(
    Number(formatInTimeZone(new Date(), user.timezone, 'H')),
  );
  return (
    <>
      {/* The daily line greets here too (WI-073): the first-run header is Today's header. */}
      <header className="home-head">
        <p className="eyebrow">
          {formatInTimeZone(bounds.start, user.timezone, 'EEEE · d MMMM yyyy')}
        </p>
        <h1>Today</h1>
        <DailyLine
          day={day}
          part={part}
          name={name}
          zone={user.timezone}
          dateLabel={formatInTimeZone(
            bounds.start,
            user.timezone,
            'EEEE · d MMMM',
          )}
        />
      </header>
      <div className="home-grid">
        <div className="home-main">
          <section
            className="welcome-hero has-pose"
            aria-labelledby="welcome-heading"
          >
            <RumiPose
              pose="checklist"
              size={128}
              className="welcome-pose"
              priority
            />
            <p className="eyebrow welcome-eyebrow">A good place to start</p>
            <h2 id="welcome-heading">Start small. Build your rhythm.</h2>
            <p>
              Choose one thing that matters today. Silsila turns it into a clear
              next step, without filling your day for you.
            </p>
            <div className="welcome-actions">
              <PanelButton panel="add-block" className="button">
                Plan my first focus <ArrowRight size={16} aria-hidden="true" />
              </PanelButton>
            </div>
          </section>
          <section className="card first-day" aria-labelledby="agenda-heading">
            <div className="agenda-head">
              <div>
                <h2 id="agenda-heading" className="agenda-heading">
                  Your day
                </h2>
                <p className="muted m-0 mt-0.5 text-[14px]">
                  A simple plan, only when you are ready
                </p>
              </div>
              <PanelButton
                panel="add-block"
                className="link-button agenda-add-button"
                data-shortcut="add-block"
              >
                <Plus size={16} aria-hidden="true" /> Add a block
              </PanelButton>
            </div>
            <FeedbackOutlet channel="blocks" className="mb-3" />
            <div className="flex items-start gap-3.5 rounded-md border border-dashed border-border p-[18px]">
              <span
                className="inline-grid size-9 flex-none place-items-center rounded-[50%] bg-primary-soft text-primary"
                aria-hidden="true"
              >
                <CalendarClock size={20} />
              </span>
              <div>
                <p className="m-0 mb-0.5 font-semibold">
                  Nothing scheduled yet
                </p>
                <p className="muted m-0">
                  Add one focus block, or leave today open. Your next step shows
                  here when you are ready.
                </p>
              </div>
            </div>
          </section>
          <p className="home-pace">One next step, at your pace.</p>
        </div>
        {!hidden && (
          <section
            className="card first-steps"
            aria-labelledby="first-steps-heading"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="first-steps-heading" className="m-0 text-[18px]">
                Your first 3 steps
              </h2>
              <span className="pill">{done} of 3</span>
            </div>
            <ol className="plain-list">
              {steps.map((s) => (
                <li
                  key={s.key}
                  className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-t-divider px-0 py-3"
                >
                  <span
                    className={s.done ? 'text-primary' : 'text-meta'}
                    aria-hidden="true"
                  >
                    {s.done ? <Check size={16} /> : <Circle size={16} />}
                  </span>
                  <span className="grid gap-0.5 text-[14px]">
                    <span
                      className={cn(
                        'text-[15px] font-semibold',
                        s.done && 'text-meta',
                      )}
                    >
                      <span className="sr-only">
                        {s.done ? 'Done: ' : 'To do: '}
                      </span>
                      {s.title}
                    </span>
                    <span className="muted">{s.hint}</span>
                  </span>
                  {!s.done &&
                    (s.key === 'focus' ? (
                      <Link
                        className="button secondary small"
                        href="/roadmap"
                        prefetch={false}
                        aria-label={`Pick: ${s.title}`}
                      >
                        Pick
                      </Link>
                    ) : (
                      <PanelButton
                        panel={s.key === 'goal' ? 'first-goal' : 'first-times'}
                        className="button secondary small"
                        aria-label={`${s.key === 'goal' ? 'Set' : 'Add'}: ${s.title}`}
                      >
                        {s.key === 'goal' ? 'Set' : 'Add'}
                      </PanelButton>
                    ))}
                </li>
              ))}
            </ol>
            <form action={hideFirstStepsAction}>
              <button type="submit" className="link-button mt-2.5">
                Skip for now
              </button>
            </form>
          </section>
        )}
      </div>
      {/* A centred modal with its own scroll (WI-069), the same form as Today's. */}
      <SidePanel id="add-block" title="Add a block" variant="modal">
        <BlockForm
          day={day}
          zone={user.timezone}
          goals={goals}
          defaultStart={slot.start}
          defaultEnd={slot.end}
        />
      </SidePanel>
      <SidePanel id="first-goal" title="Choose your goal" variant="modal">
        <GoalForm compact />
      </SidePanel>
      <SidePanel id="first-times" title="Set your study times" variant="modal">
        <RoutineForm goals={goals} compact templates={[...ROUTINE_TEMPLATES]} />
      </SidePanel>
    </>
  );
}
