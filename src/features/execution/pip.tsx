'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { clock, Ring } from './ring';

/**
 * The pop-out timer (WI-066): one Document Picture-in-Picture window for the whole app. Focus
 * opens it; the shell's `PipHost` owns it, so it keeps running while the owner moves between
 * pages. Since WI-068 it belongs to the block, not to one session: a Pause freezes it at the
 * time left, a Resume carries on from there, and it closes on Complete or when another block
 * runs. The window ticks on its own clock, so a hidden tab does not slow it down.
 */
export type PipSession = {
  /** The block's id, or the session's for a session without a block. */
  key: string;
  title: string;
  /** When the ring's window starts: earlier than the session when time was recorded before. */
  startedAt: string;
  /** The target the ring drains toward; null counts up from the start. */
  target: string | null;
  /** "since 21:11", shown when there is no target. */
  since: string;
  /** A paused block: time left and the planned length, in ms; the ring stands still. */
  paused?: { left: number; total: number } | null;
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
export function usePipOpen(key: string) {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => empty,
  );
  return !!s.win && s.session?.key === key;
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

const CHANNEL = 'silsila-session';

/**
 * Mounted once in the shell with the server's view of the session: running, paused or none.
 * It keeps the pop-out in step (WI-068), and tells the owner's other tabs when that view
 * changes, so a Pause or Complete in one tab refreshes a Focus page or pop-out left open in
 * another instead of leaving its clock running.
 */
export function PipHost({ shown }: { shown: PipSession | null }) {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => empty,
  );
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const view = shown
    ? `${shown.key}|${shown.startedAt}|${shown.paused ? 'paused' : 'running'}`
    : 'none';
  const seen = useRef(view);
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const c = new BroadcastChannel(CHANNEL);
    c.onmessage = (event) => {
      if (event.data !== seen.current) router.refresh();
    };
    channel.current = c;
    return () => {
      c.close();
      channel.current = null;
    };
  }, [router]);
  useEffect(() => {
    if (seen.current === view) return;
    seen.current = view;
    channel.current?.postMessage(view);
  }, [view]);
  // The shown block is no longer running or paused, or another one runs: the window closes.
  // Otherwise it takes the server's latest times, so a Resume continues in the same window.
  useEffect(() => {
    if (!s.session) return;
    if (!shown || shown.key !== s.session.key) closeFocusPip();
    else if (JSON.stringify(shown) !== JSON.stringify(s.session))
      set({ win: s.win, session: shown });
  }, [s.session, s.win, shown]);
  useEffect(() => {
    if (!s.win) return;
    const w = s.win;
    const timer = w.setInterval(() => setNow(Date.now()), 1000);
    return () => w.clearInterval(timer);
  }, [s.win]);
  if (!s.win || !s.session) return null;
  const session = s.session;
  const started = +new Date(session.startedAt);
  const target = session.target ? +new Date(session.target) : null;
  const paused = session.paused ?? null;
  const done = !paused && target !== null && now >= target;
  const fraction = paused
    ? 1 - paused.left / (paused.total || 1)
    : target === null
      ? null
      : done
        ? 1
        : Math.min(1, Math.max(0, (now - started) / (target - started || 1)));
  const total = paused
    ? Math.max(1, Math.round(paused.total / 60000))
    : target
      ? Math.max(1, Math.round((target - started) / 60000))
      : 0;
  return createPortal(
    <div className={`focus-pip${paused ? ' is-paused' : ''}`}>
      <Ring fraction={fraction} size={190}>
        {paused ? (
          <>
            <strong>{clock(paused.left)}</strong>
            <span>Paused · of {total} min</span>
          </>
        ) : done ? (
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
            <span>{session.since}</span>
          </>
        )}
      </Ring>
      <p>{session.title}</p>
    </div>,
    s.win.document.body,
  );
}
