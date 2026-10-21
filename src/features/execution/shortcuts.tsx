'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Today keyboard shortcuts: N adds a block, S starts the current block, ← → move a day.
 * Ignored while typing or when a modifier is held.
 */
export function TodayShortcuts({ prev, next }: { prev: string; next: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable)
      )
        return;
      const click = (selector: string) =>
        document.querySelector<HTMLElement>(selector)?.click();
      switch (event.key) {
        case 'n':
        case 'N':
          click('[data-shortcut="add-block"]');
          break;
        case 's':
        case 'S':
          click('[data-shortcut="start"]');
          break;
        case 'ArrowLeft':
          router.push(prev);
          break;
        case 'ArrowRight':
          router.push(next);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, prev, next]);
  return null;
}
