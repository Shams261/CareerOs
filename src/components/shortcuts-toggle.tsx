'use client';
import { useSyncExternalStore } from 'react';

/** Single-key shortcuts (N, S, J, K, D, C…) can be switched off per browser (WCAG 2.1.4). */
export const SHORTCUTS_KEY = 'silsila-shortcuts';
const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(SHORTCUTS_KEY) !== 'off';
  } catch {
    return true;
  }
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener('storage', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
};
export const useShortcutsEnabled = () =>
  useSyncExternalStore(subscribe, read, () => true);

export function ShortcutsToggle() {
  const enabled = useShortcutsEnabled();
  return (
    <label className="check mt-3">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          try {
            if (e.target.checked) localStorage.removeItem(SHORTCUTS_KEY);
            else localStorage.setItem(SHORTCUTS_KEY, 'off');
          } catch {
            // Storage unavailable: the shortcuts simply stay on.
          }
          for (const fn of listeners) fn();
        }}
      />
      Single-key shortcuts on this device (N, S, J, K, D, C; ? always lists
      them)
    </label>
  );
}
