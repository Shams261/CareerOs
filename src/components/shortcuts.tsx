'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShortcutsEnabled } from './shortcuts-toggle';

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
  const enabled = useShortcutsEnabled();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // A side panel that handled the key (Escape closes it) has already removed its
      // open marker by now, so a handled key must not also close the open row.
      if (event.defaultPrevented) return;
      if (document.documentElement.hasAttribute('data-panel-open')) return;
      // An open ⋯ or More menu takes the key (Escape closes it), never the page (WI-089).
      if (
        document.querySelector(
          '.more-menu-toggle[aria-expanded="true"], .today-utils-toggle[aria-expanded="true"]',
        )
      )
        return;
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
      // Single-key shortcuts can be switched off in Settings; ? and Escape always work.
      if (!enabled) return;
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
  }, [router, prev, next, shortcuts, open, enabled]);
  if (!open) return null;
  const rows: [string, string][] = [
    ...shortcuts.map((s) => [s.key.toUpperCase(), s.label] as [string, string]),
    // The arrows list whenever one of them works (WI-090: the first week has only →).
    ...(prev && next
      ? ([['← →', 'Previous and next']] as [string, string][])
      : prev
        ? ([['←', 'Previous']] as [string, string][])
        : next
          ? ([['→', 'Next']] as [string, string][])
          : []),
    ['⌘K', 'Search and run anything (Ctrl K)'],
    ['?', 'Show or hide this list'],
    ['Esc', 'Close'],
  ];
  return (
    <div className="shortcuts-backdrop" onClick={() => setOpen(false)}>
      <div
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        ref={dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">Keyboard</p>
        {!enabled && (
          <p className="muted">
            Single-key shortcuts are off on this device (Settings → Appearance).
          </p>
        )}
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
        <button
          type="button"
          className="button secondary small mt-3"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
    </div>
  );
}
