'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { RumiChat } from './chat';
import { AGENT_NAME } from './domain';
import { ASK_EVENT, ASK_KEY, DRAWER_FLAG, OPEN_RUMI_EVENT } from './events';

/** Pages where the round button would repeat or interrupt: Rumi's own page and Focus. */
const HIDDEN = ['/rumi', '/focus', '/login', '/privacy'];
const hiddenOn = (path: string) =>
  HIDDEN.some((p) => path === p || path.startsWith(`${p}/`));
/** The owner's date for the plan cards' "Today"; the device's clock is the owner's. */
const localToday = () => new Intl.DateTimeFormat('en-CA').format(new Date());
const NONE: never[] = [];

/**
 * Rumi from any page (WI-060): a round button at the bottom right opens a chat drawer beside
 * the page, which stays as it is. The chat is the same one as /rumi, kept while the tab lives,
 * so closing and reopening continues the conversation. Esc closes it.
 */
export function RumiDrawer() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Mounted on first open and kept, so the conversation survives closing the drawer.
  const [started, setStarted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hidden = hiddenOn(path);

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

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (hidden) return null;
  return (
    <>
      <button
        ref={button}
        type="button"
        className="rumi-fab"
        aria-label={open ? `Close ${AGENT_NAME}` : `Ask ${AGENT_NAME}`}
        aria-expanded={open}
        aria-controls="rumi-drawer"
        onClick={() => {
          setStarted(true);
          setOpen((o) => !o);
        }}
      >
        {open ? (
          <X size={22} aria-hidden="true" />
        ) : (
          <MessageCircle size={22} aria-hidden="true" />
        )}
      </button>
      {started && (
        <div
          ref={panel}
          id="rumi-drawer"
          className="rumi-drawer"
          role="dialog"
          aria-label={`Ask ${AGENT_NAME}`}
          hidden={!open}
        >
          <div className="rumi-drawer-head">
            <h2>{AGENT_NAME}</h2>
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
            drawer
          />
        </div>
      )}
    </>
  );
}
