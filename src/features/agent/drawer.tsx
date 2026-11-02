'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { RumiChat } from './chat';
import { AGENT_NAME } from '@/features/agent/constants';
import { RumiMark } from './mark';
import { RumiButton } from './rumi-button';
import { BUTTON_EVENT, type ButtonPref } from './button-pref';
import {
  ASK_EVENT,
  ASK_KEY,
  DRAWER_FLAG,
  OPEN_RUMI_EVENT,
  PREFILL_EVENT,
  PREFILL_KEY,
  RUMI_KEY_LABEL,
  isRumiKey,
} from './events';

/**
 * Pages where the round button would repeat or interrupt: Rumi's own page, Focus (the one
 * screen kept free of everything else), and the signed-out pages.
 */
const HIDDEN = ['/rumi', '/focus', '/login', '/privacy'];
const hiddenOn = (path: string) =>
  HIDDEN.some((p) => path === p || path.startsWith(`${p}/`));
/** The owner's date for the plan cards' "Today"; the device's clock is the owner's. */
const localToday = () => new Intl.DateTimeFormat('en-CA').format(new Date());
const NONE: never[] = [];
const noSubscribe = () => () => {};

/**
 * Rumi from any page (WI-060): a round button at the bottom right opens a chat drawer beside
 * the page, which stays as it is. The chat is the same one as /rumi, kept while the tab lives,
 * so closing and reopening continues the conversation. Esc closes it. Since WI-111 the button
 * carries Rumi's mark and shows on a desktop too, and ⌘/ (Ctrl+/) opens or closes the drawer
 * from any page that has it; on the Rumi page the key goes to the composer. Since WI-115 the
 * button is `RumiButton` (hide, drag to a corner, fold to the edge); with it hidden the
 * drawer still opens from the sidebar's hand-overs, ⌘/ and ⌘K.
 */
export function RumiDrawer({ button: initialButton }: { button: ButtonPref }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // WI-115: shown or hidden, and which corner; the server read it from the cookie.
  const [pref, setPref] = useState(initialButton);
  useEffect(() => {
    const onPref = (e: Event) => setPref((e as CustomEvent<ButtonPref>).detail);
    window.addEventListener(BUTTON_EVENT, onPref);
    return () => window.removeEventListener(BUTTON_EVENT, onPref);
  }, []);
  // Mounted on first open and kept, so the conversation survives closing the drawer.
  const [started, setStarted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hidden = hiddenOn(path);
  // The device decides the key's name; the server render uses the general one.
  const keyLabel = useSyncExternalStore(
    noSubscribe,
    () =>
      /Mac|iPhone|iPad/.test(navigator.userAgent)
        ? RUMI_KEY_LABEL.mac
        : RUMI_KEY_LABEL.other,
    () => RUMI_KEY_LABEL.other,
  );

  // ⌘/ (Ctrl+/) from anywhere: the drawer opens or closes; on the Rumi page, the composer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isRumiKey(e)) return;
      if (path === '/rumi' || path.startsWith('/rumi/')) {
        e.preventDefault();
        document
          .querySelector<HTMLTextAreaElement>('.rumi-compose textarea')
          ?.focus();
        return;
      }
      if (hidden) return;
      e.preventDefault();
      setStarted(true);
      setOpen(!open);
      if (open) button.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hidden, path, open]);

  useEffect(() => {
    if (hidden) return;
    document.body.dataset[DRAWER_FLAG] = 'on';
    const show = () => {
      setStarted(true);
      setOpen(true);
      // A question handed over while the chat is already mounted.
      setTimeout(() => {
        try {
          if (sessionStorage.getItem(ASK_KEY))
            window.dispatchEvent(new Event(ASK_EVENT));
          if (sessionStorage.getItem(PREFILL_KEY))
            window.dispatchEvent(new Event(PREFILL_EVENT));
        } catch {
          /* storage unavailable: nothing to take */
        }
      }, 0);
    };
    window.addEventListener(OPEN_RUMI_EVENT, show);
    return () => {
      delete document.body.dataset[DRAWER_FLAG];
      window.removeEventListener(OPEN_RUMI_EVENT, show);
    };
  }, [hidden]);

  // A reply read aloud stops when the drawer closes (WI-104).
  useEffect(() => {
    if (!open && typeof window !== 'undefined' && 'speechSynthesis' in window)
      window.speechSynthesis.cancel();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (hidden) return null;
  return (
    <>
      {pref.shown && (
        <RumiButton
          open={open}
          onToggle={() => {
            setStarted(true);
            setOpen((o) => !o);
          }}
          keyLabel={keyLabel}
          pref={pref}
          buttonRef={button}
        />
      )}
      {started && (
        <div
          ref={panel}
          id="rumi-drawer"
          className="rumi-drawer"
          data-side={pref.side}
          role="dialog"
          aria-label={`Ask ${AGENT_NAME}`}
          hidden={!open}
        >
          <div className="rumi-drawer-head">
            <h2>
              <RumiMark size={26} />
              {AGENT_NAME}
            </h2>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              <X size={16} aria-hidden="true" /> Close
            </button>
          </div>
          <RumiChat
            conversationId={null}
            title={null}
            initial={NONE}
            budget=""
            today={localToday()}
            page={path}
            drawer
          />
        </div>
      )}
    </>
  );
}
