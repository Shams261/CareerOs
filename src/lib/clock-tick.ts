'use client';
import { useEffect, useState } from 'react';

/**
 * One clock for every countdown (WI-073). Each tick lands on the whole second, so Focus, the
 * pop-out, the sidebar card, Today's card and the tab title all change in the same instant
 * instead of each on its own interval; and a window coming back into view resyncs at once,
 * since browsers slow a hidden window's timers. `win` is the window whose timers to use (the
 * pop-out has its own).
 */
export function onEverySecond(fn: (now: number) => void, win: Window = window) {
  let timer = 0;
  let interval = 0;
  const start = () => {
    win.clearTimeout(timer);
    win.clearInterval(interval);
    fn(Date.now());
    timer = win.setTimeout(
      () => {
        fn(Date.now());
        interval = win.setInterval(() => fn(Date.now()), 1000);
      },
      1000 - (Date.now() % 1000),
    );
  };
  start();
  const doc = win.document;
  doc.addEventListener('visibilitychange', start);
  win.addEventListener('focus', start);
  return () => {
    win.clearTimeout(timer);
    win.clearInterval(interval);
    doc.removeEventListener('visibilitychange', start);
    win.removeEventListener('focus', start);
  };
}

/** The current time, refreshed on every whole second; starts at `initial` (the server's clock). */
export function useSecondTick(initial?: number | string) {
  const [now, setNow] = useState(() =>
    initial === undefined ? Date.now() : +new Date(initial),
  );
  useEffect(() => onEverySecond(setNow), []);
  return now;
}
