'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Toasts (WI-080 fix): a refusal from a launcher or sidebar action shows as one floating card
 * at the foot of the screen instead of a line squeezed beside the button. Each toast leaves
 * by itself after a moment or on ×; three at most; `role="alert"` reads it out at once.
 */
export type Toast = { id: number; message: string; tone: 'warning' };
const VISIBLE_MS = 7000;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const set = (next: Toast[]) => {
  toasts = next;
  for (const fn of listeners) fn();
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const empty: Toast[] = [];

export function publishToast(message: string, tone: Toast['tone'] = 'warning') {
  const toast = { id: nextId++, message, tone };
  set([...toasts.slice(-2), toast]);
  setTimeout(() => dismissToast(toast.id), VISIBLE_MS);
}
export function dismissToast(id: number) {
  if (toasts.some((t) => t.id === id)) set(toasts.filter((t) => t.id !== id));
}

/** Mounted once in the shell. */
export function ToastHost() {
  const list = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => empty,
  );
  useEffect(() => {
    if (!list.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) set([]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [list.length]);
  if (!list.length) return null;
  return (
    <div className="toast-host" aria-label="Messages">
      {list.map((t) => (
        <div key={t.id} className={`toast is-${t.tone}`} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span className="toast-text">{t.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss"
            onClick={() => dismissToast(t.id)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
