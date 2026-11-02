'use client';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

const HINT_KEY = 'silsila-study-hint-seen';
const hintListeners = new Set<() => void>();
function subscribeHint(onChange: () => void) {
  hintListeners.add(onChange);
  return () => {
    hintListeners.delete(onChange);
  };
}
function hintSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * The first time an item opens (WI-053), one line says how studying works here; Got it keeps
 * it away on this device. The server renders nothing, so it never flashes for a returning owner.
 */
export function StudyHint() {
  const seen = useSyncExternalStore(subscribeHint, hintSeen, () => true);
  if (seen) return null;
  return (
    <p className="study-hint">
      Copy the prompt into Claude or ChatGPT, study there, then come back and
      mark it.{' '}
      <Button
        type="button"
        variant="link"
        onClick={() => {
          try {
            localStorage.setItem(HINT_KEY, '1');
          } catch {
            /* storage unavailable: the hint simply stays */
          }
          hintListeners.forEach((l) => l());
        }}
      >
        Got it
      </Button>
    </p>
  );
}
