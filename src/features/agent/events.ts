/**
 * How a question reaches Rumi (WI-040): the words go in this tab's sessionStorage, never in a
 * URL, and the event asks an open chat to take them. Since WI-060 the round Rumi button's
 * drawer takes them on any page; without it (Focus, or AI off) the Rumi page does.
 */
export const ASK_KEY = 'silsila-rumi-ask';
export const ASK_EVENT = 'silsila:ask-rumi';
/** Opens the Rumi drawer (WI-060). */
export const OPEN_RUMI_EVENT = 'silsila:open-rumi';
/** Set on <body> while the drawer is available on this page. */
export const DRAWER_FLAG = 'rumiDrawer';

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
