import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowRight, CalendarClock, Check, Circle, Plus } from 'lucide-react';
import { Disclosure } from '@/components/disclosure';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { db } from '@/server/db';
import { formatInTimeZone } from 'date-fns-tz';
import type { ScheduleUser } from '@/features/schedule/service';
import { BlockForm, RoutineForm } from '@/features/schedule/forms';
import { ROUTINE_TEMPLATES } from '@/features/schedule/templates';
import { GoalForm } from '@/features/roadmap/forms';
import { startPickAction } from '@/features/for-today/actions';
import type { TodayPick } from '@/features/for-today/domain';
import { hideFirstStepsAction } from './actions';
import { FIRST_STEPS_COOKIE } from './first-steps-cookie';
import { firstSteps } from './home';
import { nextSlot } from './domain';
import { PanelButton, SidePanel } from './panels';

/**
 * Today for an empty account (WI-065, ADR-027): one welcoming action, three optional steps
 * and a calm empty day. Nothing is required: Plan my first focus offers today's picks to start
 * now or a block for later, and the steps (goal, study times, a learning focus) open in panels.
 */
export async function FirstRunToday({
  user,
  day,
  bounds,
  goals,
  picks,
}: {
  user: ScheduleUser;
  day: string;
  bounds: { start: Date };
  goals: { id: string; title: string; status: string }[];
  picks: TodayPick[];
}) {
  const [hidden, focus] = await Promise.all([
    cookies().then((c) => !!c.get(FIRST_STEPS_COOKIE)),
    // A learning focus: any roadmap item or practice problem the owner has begun.
    Promise.all([
      db().roadmapItem.count({
        where: { userId: user.id, status: { not: 'NOT_STARTED' } },
        take: 1,
      }),
      db().dsaAttempt.count({ where: { userId: user.id }, take: 1 }),
    ]).then(([items, attempts]) => items + attempts > 0),
  ]);
  const { steps, done } = firstSteps({
    hasGoal: goals.some((g) => g.status === 'ACTIVE'),
    hasRoutine: false,
    hasFocus: focus,
  });
  const pick = picks[0] ?? null;
  // A new block starts at the next quarter hour, never at a time already gone (WI-066).
  const slot = nextSlot(new Date(), user.timezone, day);
  return (
    <>
      <header className="home-head">
        <p className="eyebrow">
          {formatInTimeZone(bounds.start, user.timezone, 'EEEE · d MMMM yyyy')}
        </p>
        <h1>Today</h1>
      </header>
      <div className="home-grid">
        <div className="home-main">
          <section className="welcome-hero" aria-labelledby="welcome-heading">
            <p className="eyebrow welcome-eyebrow">A good place to start</p>
            <h2 id="welcome-heading">Start small. Build your rhythm.</h2>
            <p>
              Choose one thing that matters today. Silsila turns it into a clear
              next step, without filling your day for you.
            </p>
            <div className="welcome-actions">
              <PanelButton panel="first-focus" className="button">
                Plan my first focus <ArrowRight size={16} aria-hidden="true" />
              </PanelButton>
              {pick && (
                <ActionForm
                  action={startPickAction}
                  label={`Try a 20-minute session: ${pick.title}`}
                >
                  <input type="hidden" name="title" value={pick.title} />
                  <input type="hidden" name="category" value={pick.category} />
                  <Button variant="link">or try a 20-minute session</Button>
                </ActionForm>
              )}
            </div>
          </section>
          <section className="card first-day" aria-labelledby="agenda-heading">
            <div className="agenda-head">
              <div>
                <h2 id="agenda-heading" className="agenda-heading">
                  Your day
                </h2>
                <p className="muted first-day-sub">
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
            <div className="first-day-empty">
              <span className="first-day-icon" aria-hidden="true">
                <CalendarClock size={20} />
              </span>
              <div>
                <p className="first-day-title">Nothing scheduled yet</p>
                <p className="muted">
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
            <div className="first-steps-head">
              <h2 id="first-steps-heading">Your first 3 steps</h2>
              <span className="pill">{done} of 3</span>
            </div>
            <ol className="plain-list first-steps-list">
              {steps.map((s) => (
                <li key={s.key} className={s.done ? 'is-done' : ''}>
                  <span className="first-step-mark" aria-hidden="true">
                    {s.done ? <Check size={16} /> : <Circle size={16} />}
                  </span>
                  <span className="first-step-text">
                    <span className="first-step-title">
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
              <button type="submit" className="link-button first-steps-skip">
                Skip for now
              </button>
            </form>
          </section>
        )}
      </div>
      <SidePanel id="first-focus" title="Plan my first focus" variant="modal">
        {picks.length > 0 && (
          <>
            <h3>Start one now</h3>
            <ul className="plain-list first-picks">
              {picks.map((p, i) => (
                <li key={p.key}>
                  <span>
                    <strong>{p.title}</strong>
                    <span className="muted">{p.reason}</span>
                  </span>
                  <ActionForm
                    action={startPickAction}
                    label={`Start 20 min: ${p.title}`}
                  >
                    <input type="hidden" name="title" value={p.title} />
                    <input type="hidden" name="category" value={p.category} />
                    {/* One filled button in the panel: the first pick. */}
                    <Button
                      variant={i === 0 ? 'primary' : 'secondary'}
                      className="small"
                    >
                      Start 20 min
                    </Button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </>
        )}
        {/* One thing at a time (WI-071): the form opens under one link. */}
        <Disclosure
          variant="link"
          label="Or plan it for later today"
          className="mt-4"
        >
          <BlockForm
            day={day}
            zone={user.timezone}
            goals={goals}
            defaultStart={slot.start}
            defaultEnd={slot.end}
          />
        </Disclosure>
      </SidePanel>
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
