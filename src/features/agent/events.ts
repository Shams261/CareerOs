/**
 * How a question reaches Rumi (WI-040): the words go in this tab's sessionStorage, never in a
 * URL, and the event asks an open chat to take them. Since WI-060 the round Rumi button's
 * drawer takes them on any page; without it (Focus, or AI off) the Rumi page does.
 */
import { DRAWER_FLAG } from '@/lib/rumi';

export const ASK_KEY = 'silsila-rumi-ask';
export const ASK_EVENT = 'silsila:ask-rumi';
/** Opens the Rumi drawer (WI-060). */
export const OPEN_RUMI_EVENT = 'silsila:open-rumi';
/** Set on <body> while the drawer is available on this page (kept in the kernel since WI-144). */
export { DRAWER_FLAG };
/** Words put in the composer without sending (WI-101: Reply on one of Rumi's lines). */
export const PREFILL_KEY = 'silsila-rumi-prefill';
export const PREFILL_EVENT = 'silsila:prefill-rumi';

/**
 * Puts `text` in Rumi's composer without sending it (WI-101): the drawer when this page has it,
 * else the Rumi page. The owner finishes the message and presses Send.
 */
export function prefillRumi(text: string, go: (href: string) => void) {
  try {
    sessionStorage.setItem(PREFILL_KEY, text);
  } catch {
    return false;
  }
  if (location.pathname === '/rumi')
    window.dispatchEvent(new Event(PREFILL_EVENT));
  else if (document.body.dataset[DRAWER_FLAG] === 'on')
    window.dispatchEvent(new Event(OPEN_RUMI_EVENT));
  else go('/rumi');
  return true;
}
/**
 * Asks Rumi `text` from anywhere: the drawer when this page has it, the open Rumi page, or
 * the Rumi page after navigating there. Returns false when storage is unavailable.
 */
export function askRumi(text: string, go: (href: string) => void) {
  try {
    sessionStorage.setItem(ASK_KEY, text);
  } catch {
    return false;
  }
  if (location.pathname === '/rumi') window.dispatchEvent(new Event(ASK_EVENT));
  else if (document.body.dataset[DRAWER_FLAG] === 'on')
    window.dispatchEvent(new Event(OPEN_RUMI_EVENT));
  else go('/rumi');
  return true;
}

/**
 * The key that opens and closes Rumi from any page (WI-111): ⌘/ on a Mac, Ctrl+/ elsewhere.
 * A modifier key, so it works while typing and never meets the page's single-key shortcuts.
 */
export const RUMI_KEY_LABEL = { mac: '⌘/', other: 'Ctrl+/' } as const;
export const isRumiKey = (e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}) => e.key === '/' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
