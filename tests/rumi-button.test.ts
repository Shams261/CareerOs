import { describe, expect, it } from 'vitest';
import {
  buttonContext,
  buttonCookieValue,
  DEFAULT_BUTTON,
  resolveButtonPref,
  sideFor,
  tucked,
} from '../src/features/agent/button-pref';

describe('the Rumi button’s place (WI-115)', () => {
  it('reads the cookie, and falls back to shown in the right corner', () => {
    expect(resolveButtonPref(undefined)).toEqual(DEFAULT_BUTTON);
    expect(resolveButtonPref('garbage')).toEqual(DEFAULT_BUTTON);
    expect(resolveButtonPref('left')).toEqual({ shown: true, side: 'left' });
    expect(resolveButtonPref('off')).toEqual({ shown: false, side: 'right' });
    for (const p of [
      { shown: true, side: 'right' },
      { shown: true, side: 'left' },
      { shown: false, side: 'right' },
      { shown: false, side: 'left' },
    ] as const)
      expect(resolveButtonPref(buttonCookieValue(p))).toEqual(p);
  });
  it('says in Settings where the button is, or that Rumi still opens without it', () => {
    expect(buttonContext({ shown: true, side: 'left' })).toMatch(
      /^On · left corner/,
    );
    expect(buttonContext({ shown: false, side: 'right' })).toMatch(
      /^Hidden · the sidebar and ⌘\/ still open Rumi/,
    );
  });
  it('drops into the corner of the half the pointer is in', () => {
    expect(sideFor(100, 1440)).toBe('left');
    expect(sideFor(1000, 1440)).toBe('right');
  });
  it('folds to the edge while a pose is in view or the page scrolls down past its top', () => {
    expect(
      tucked({ scrollingDown: false, scrollY: 0, poseInView: false }),
    ).toBe(false);
    expect(
      tucked({ scrollingDown: false, scrollY: 900, poseInView: true }),
    ).toBe(true);
    expect(
      tucked({ scrollingDown: true, scrollY: 60, poseInView: false }),
    ).toBe(false);
    expect(
      tucked({ scrollingDown: true, scrollY: 400, poseInView: false }),
    ).toBe(true);
    expect(
      tucked({ scrollingDown: false, scrollY: 400, poseInView: false }),
    ).toBe(false);
  });
});
