'use client';
import { useEffect } from 'react';
import { clock } from './ring';

/** A countdown prefix the clock writes ("17:34 · Silsila"), stripped before each write. */
const PREFIX = /^\d+:\d\d(?::\d\d)? · /;

/**
 * The time left in the browser tab's title while a session runs (WI-069), so it shows from
 * any other tab. Next.js rewrites the title on navigation; each tick strips the old prefix
 * from whatever the title is now and writes the new one, and the title is left plain when the
 * session ends. Nothing is written when the document is hidden and the tab shows it anyway.
 */
export function TitleClock({ target }: { target: string }) {
  useEffect(() => {
    const end = +new Date(target);
    const write = () => {
      const base = document.title.replace(PREFIX, '');
      const left = end - Date.now();
      document.title = left > 0 ? `${clock(left)} · ${base}` : base;
    };
    write();
    const timer = setInterval(write, 1000);
    return () => {
      clearInterval(timer);
      document.title = document.title.replace(PREFIX, '');
    };
  }, [target]);
  return null;
}
