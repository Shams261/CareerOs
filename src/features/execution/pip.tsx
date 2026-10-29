'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { clock, Ring } from './ring';

/**
 * The pop-out timer (WI-066): one Document Picture-in-Picture window for the whole app. Focus
 * opens it; the shell's `PipHost` owns it, so it keeps running while the owner moves between
 * pages, and it closes when the session it shows is no longer the running one (Stop, Complete,
 * or a session started elsewhere). The window ticks on its own clock, so a hidden tab does not
 * slow it down.
 */
export type PipSession = {
  id: string;
  title: string;
  startedAt: string;
  /** The target the ring drains toward; null counts up from the start. */
  target: string | null;
  /** "since 21:11", shown when there is no target. */
  since: string;
};
type PipApi = {
  requestWindow: (o: { width: number; height: number }) => Promise<Window>;
};
type State = { win: Window | null; session: PipSession | null };
let state: State = { win: null, session: null };
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  for (const fn of listeners) fn();
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const empty: State = { win: null, session: null };

export const pipSupported = () =>
  typeof window !== 'undefined' && 'documentPictureInPicture' in window;

/** Whether the pop-out window is open, for Focus's "Pop out" / "Close pop-out" button. */
export function usePipOpen(sessionId: string) {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => empty,
  );
  return !!s.win && s.session?.id === sessionId;
}

export function closeFocusPip() {
  state.win?.close();
  set(empty);
}

/** Opens (or reuses) the window for this session; false when the browser cannot. */
export async function openFocusPip(session: PipSession) {
  const api = (window as unknown as { documentPictureInPicture?: PipApi })
    .documentPictureInPicture;
  if (!api) return false;
  if (state.win) {
    set({ win: state.win, session });
    return true;
  }
  try {
    const w = await api.requestWindow({ width: 260, height: 300 });
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const style = w.document.createElement('style');
        style.textContent = Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join('\n');
        w.document.head.append(style);
      } catch {
        if (sheet.href) {
          const link = w.document.createElement('link');
          link.rel = 'stylesheet';
          link.href = sheet.href;
          w.document.head.append(link);
        }
      }
    }
    w.document.documentElement.className = document.documentElement.className;
    w.document.body.className = 'focus-pip-body';
    w.document.title = session.title;
    w.addEventListener('pagehide', () => {
      if (state.win === w) set(empty);
    });
    set({ win: w, session });
    return true;
  } catch {
    // Some embedded or locked-down browsers expose the API but cannot open the window.
    return false;
  }
}

/** Mounted once in the shell; `runningId` is the server's running session, or null. */
export function PipHost({ runningId }: { runningId: string | null }) {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => empty,
  );
  const [now, setNow] = useState(() => Date.now());
  // The shown session ended or another one runs now: the window closes with it.
  useEffect(() => {
    if (s.session && s.session.id !== runningId) closeFocusPip();
  }, [s.session, runningId]);
  useEffect(() => {
    if (!s.win) return;
    const w = s.win;
    const timer = w.setInterval(() => setNow(Date.now()), 1000);
    return () => w.clearInterval(timer);
  }, [s.win]);
  if (!s.win || !s.session) return null;
  const started = +new Date(s.session.startedAt);
  const target = s.session.target ? +new Date(s.session.target) : null;
  const done = target !== null && now >= target;
  const fraction =
    target === null
      ? null
      : done
        ? 1
        : Math.min(1, Math.max(0, (now - started) / (target - started || 1)));
  const total = target
    ? Math.max(1, Math.round((target - started) / 60000))
    : 0;
  return createPortal(
    <div className="focus-pip">
      <Ring fraction={fraction} size={190}>
        {done ? (
          <>
            <strong>{total} min</strong>
            <span>Time is up</span>
          </>
        ) : target ? (
          <>
            <strong>{clock(target - now)}</strong>
            <span>left of {total} min</span>
          </>
        ) : (
          <>
            <strong>{clock(now - started)}</strong>
            <span>{s.session.since}</span>
          </>
        )}
      </Ring>
      <p>{s.session.title}</p>
    </div>,
    s.win.document.body,
  );
}
