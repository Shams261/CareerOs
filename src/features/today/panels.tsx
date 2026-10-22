'use client';
import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { DisclosureContext } from '@/components/disclosure';

/**
 * One modal side panel at a time (WI-020). The store holds which panel is open and the
 * button that opened it; the panel renders its children only while open, so one block form
 * is mounted at a time. While open, everything else on the page is `inert`, the page does
 * not scroll, focus stays inside, Escape closes, and focus returns to the opener.
 */
type State = {
  open: string | null;
  opener: HTMLElement | null;
  focus: string | null;
};
let state: State = { open: null, opener: null, focus: null };
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
const snapshot = () => state;
const serverSnapshot: State = { open: null, opener: null, focus: null };
export const openPanel = (
  id: string,
  opener: HTMLElement | null,
  focus: string | null = null,
) => set({ open: id, opener, focus });
export const closePanel = () => {
  const opener = state.opener;
  set({ open: null, opener: null, focus: null });
  // Focus returns after the panel has gone, so the opener is focusable again.
  setTimeout(() => {
    if (opener?.isConnected) opener.focus();
  }, 0);
};
const usePanelState = () =>
  useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);

/** A button that opens a panel; `focus` names a `data-panel-focus` target inside it. */
export function PanelButton({
  panel,
  focus,
  children,
  className = 'button secondary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  panel: string;
  focus?: string;
  children: ReactNode;
}) {
  const current = usePanelState();
  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      aria-expanded={current.open === panel}
      onClick={(e) => openPanel(panel, e.currentTarget, focus ?? null)}
      {...props}
    >
      {children}
    </button>
  );
}

/** A button that presses another control by its `data-shortcut` name (the header's Add). */
export function PressButton({
  press,
  children,
  className = 'button secondary',
}: {
  press: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const el = document.querySelector<HTMLElement>(
          `[data-shortcut="${press}"]`,
        );
        el?.click();
        el?.scrollIntoView({ block: 'nearest' });
      }}
    >
      {children}
    </button>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The panel itself. Rendered through a portal at the end of `<body>`, so `inert` on the
 * body's other children covers the shell, the navigation and the running strip.
 */
export function SidePanel({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const current = usePanelState();
  const open = current.open === id;
  const root = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const pathname = usePathname();
  const search = useSearchParams();
  const url = `${pathname}?${search.toString()}`;
  const seenUrl = useRef(url);
  // Navigating away (a chain day, a link in a row) closes the panel.
  useEffect(() => {
    if (seenUrl.current === url) return;
    seenUrl.current = url;
    if (open) closePanel();
  }, [url, open]);
  useEffect(() => {
    if (!open) return;
    const panel = root.current;
    if (!panel) return;
    const others = [...document.body.children].filter((el) => el !== panel);
    const previouslyInert = others.filter((el) => el.hasAttribute('inert'));
    for (const el of others) el.setAttribute('inert', '');
    document.documentElement.setAttribute('data-panel-open', id);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const target =
      (current.focus &&
        panel.querySelector<HTMLElement>(
          `[data-panel-focus="${current.focus}"]`,
        )) ||
      panel.querySelector<HTMLElement>('[data-panel-heading]');
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      );
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0],
        last = items[items.length - 1],
        active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      for (const el of others)
        if (!previouslyInert.includes(el)) el.removeAttribute('inert');
      document.documentElement.removeAttribute('data-panel-open');
      document.body.style.overflow = overflow;
    };
    // The focus target is read once, when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);
  if (!open) return null;
  return createPortal(
    <div className="side-panel-root" ref={root}>
      <div className="side-panel-backdrop" onClick={closePanel} />
      <section
        className="side-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="side-panel-head">
          <h2 id={headingId} tabIndex={-1} data-panel-heading>
            {title}
          </h2>
          <button
            type="button"
            className="button secondary small side-panel-close"
            onClick={closePanel}
            aria-label={`Close ${title}`}
          >
            <X size={16} aria-hidden="true" /> Close
          </button>
        </header>
        <div className="side-panel-body">
          <DisclosureContext.Provider value={{ close: closePanel }}>
            {children}
          </DisclosureContext.Provider>
        </div>
      </section>
    </div>,
    document.body,
  );
}
