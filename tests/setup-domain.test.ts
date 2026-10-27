import { describe, expect, it } from 'vitest';
import {
  setupComplete,
  setupLine,
  setupSteps,
  type SetupFacts,
} from '../src/features/setup/domain';
import { BANNED_WORDS } from '../src/features/nudges/domain';

const empty: SetupFacts = {
  goalDate: false,
  routines: 0,
  studyKinds: false,
  calendar: null,
  devices: 0,
  applications: 0,
};

describe('Make Silsila yours (WI-050)', () => {
  it('lists six steps, each ticked only by the records', () => {
    const steps = setupSteps(empty);
    expect(steps.map((s) => s.key)).toEqual([
      'goal',
      'routines',
      'kinds',
      'calendar',
      'push',
      'jobs',
    ]);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(setupLine(steps)).toBe('0 of 6 done');
    const half = setupSteps({
      ...empty,
      goalDate: true,
      routines: 2,
      calendar: 'CONNECTED',
    });
    expect(half.filter((s) => s.done).map((s) => s.key)).toEqual([
      'goal',
      'routines',
      'calendar',
    ]);
    expect(setupComplete(half)).toBe(false);
    const all = setupSteps({
      goalDate: true,
      routines: 1,
      studyKinds: true,
      calendar: 'CONNECTED',
      devices: 1,
      applications: 1,
    });
    expect(setupLine(all)).toBe('6 of 6 done');
    expect(setupComplete(all)).toBe(true);
  });

  it('asks to reconnect a calendar that needs it, and points each step at its place', () => {
    const steps = setupSteps({ ...empty, calendar: 'REAUTH_REQUIRED' });
    const cal = steps.find((s) => s.key === 'calendar')!;
    expect(cal).toMatchObject({
      title: 'Reconnect Google Calendar',
      done: false,
      href: '/settings#calendar',
    });
    expect(
      setupSteps({ ...empty, calendar: 'DISCONNECTED' }).find(
        (s) => s.key === 'calendar',
      )!.title,
    ).toBe('Connect Google Calendar');
    expect(steps.find((s) => s.key === 'routines')).toMatchObject({
      href: '/calendar',
      panel: 'routines',
    });
    expect(steps.find((s) => s.key === 'goal')).toMatchObject({
      href: '/roadmap',
      panel: 'goals',
    });
    for (const s of steps)
      for (const w of BANNED_WORDS)
        expect(`${s.title} ${s.action}`.toLowerCase()).not.toContain(w);
  });
});
