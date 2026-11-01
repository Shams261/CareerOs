/**
 * The round Rumi button's place, the owner's per-browser choice (WI-115): shown or hidden,
 * and in the right or left corner. A cookie, so the server draws the button where it was
 * left and a page never jumps; hiding the button never turns Rumi off (the sidebar, ⌘/ and
 * ⌘K still open it). Covered by tests/rumi-button.test.ts.
 */
export const RUMI_BUTTON_COOKIE = 'silsila-rumi-button';
export const BUTTON_EVENT = 'silsila:rumi-button';
export type Side = 'left' | 'right';
export type ButtonPref = { shown: boolean; side: Side };
export const DEFAULT_BUTTON: ButtonPref = { shown: true, side: 'right' };

/** "right", "left", "off-right" or "off-left"; anything else is the default. */
export function resolveButtonPref(value: string | undefined): ButtonPref {
  switch (value) {
    case 'left':
      return { shown: true, side: 'left' };
    case 'off-left':
      return { shown: false, side: 'left' };
    case 'off-right':
    case 'off':
      return { shown: false, side: 'right' };
    default:
      return DEFAULT_BUTTON;
  }
}
export const buttonCookieValue = (p: ButtonPref) =>
  p.shown ? p.side : `off-${p.side}`;
/** Pointer travel before a press becomes a drag. */
export const DRAG_SLOP = 8;
/** The corner a drop lands in: the half of the screen the pointer is in. */
export const sideFor = (x: number, width: number): Side =>
  x < width / 2 ? 'left' : 'right';
/**
 * Whether the button folds small into its corner: while the page scrolls down past its top,
 * or while one of Rumi's poses is on screen (one Rumi in view at a time).
 */
export const tucked = (s: {
  scrollingDown: boolean;
  scrollY: number;
  poseInView: boolean;
}) => s.poseInView || (s.scrollingDown && s.scrollY > 120);

/** Settings → Rumi button's context line. */
export const buttonContext = (p: ButtonPref) =>
  p.shown
    ? `On · ${p.side} corner · drag it to move, × to hide`
    : 'Hidden · the sidebar and ⌘/ still open Rumi';

/** Saves the choice for this browser and tells every open part of the page. */
export function saveButtonPref(p: ButtonPref) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${RUMI_BUTTON_COOKIE}=${buttonCookieValue(p)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  window.dispatchEvent(
    new CustomEvent<ButtonPref>(BUTTON_EVENT, { detail: p }),
  );
}
