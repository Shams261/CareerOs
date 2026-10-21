'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export type Shortcut = {
  key: string;
  label: string;
  /** A `data-shortcut` name; the key presses that element. */
  press?: string;
  /** A path to open instead of pressing an element. */
  href?: string;
};

/**
 * Page keyboard shortcuts and the `?` overlay that lists them. Ignored while typing or when a
 * modifier is held; arrows move through days or weeks when `prev` and `next` are given.
 */
export function PageShortcuts({
  shortcuts,
  prev,
  next,
}: {
  shortcuts: Shortcut[];
  prev?: string;
  next?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      if (event.key === 'Escape' && open) {
        setOpen(false);
        return;
      }
      if (event.key === '?') {
        setOpen((o) => !o);
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowLeft' && prev) {
        router.push(prev);
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowRight' && next) {
        router.push(next);
        event.preventDefault();
        return;
      }
      const hit = shortcuts.find(
        (s) => s.key.toLowerCase() === event.key.toLowerCase(),
      );
      if (!hit) return;
      if (hit.href) router.push(hit.href);
      else if (hit.press)
        document
          .querySelector<HTMLElement>(`[data-shortcut="${hit.press}"]`)
          ?.click();
      setOpen(false);
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, prev, next, shortcuts, open]);
  if (!open) return null;
  const rows: [string, string][] = [
    ...shortcuts.map((s) => [s.key.toUpperCase(), s.label] as [string, string]),
    ...(prev && next
      ? ([['← →', 'Previous and next']] as [string, string][])
      : []),
    ['?', 'Show or hide this list'],
    ['Esc', 'Close'],
  ];
  return (
    <div className="shortcuts-backdrop" onClick={() => setOpen(false)}>
      <div
        className="shortcuts"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">Keyboard</p>
        <dl>
          {rows.map(([k, label]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
