'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { DisclosureContext } from '@/components/disclosure';

/**
 * A block's details open in place, under its row (WI-068), instead of a side panel: one row
 * at a time, the rest of the page still in view. `focus` names the tab to open on ("log",
 * "edit"); the row's Log time and Reschedule buttons and the command bar use it.
 */
type State = { open: string | null; focus: string | null };
let state: State = { open: null, focus: null };
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
const empty: State = { open: null, focus: null };
const useRowState = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => empty,
  );
export const closeRow = () => set(empty);

const RowFocus = createContext<string | null>(null);

/** Opens (or closes) a row's details; `focus` opens it on that tab. */
export function RowButton({
  row,
  focus,
  children,
  className = 'link-button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  row: string;
  focus?: string;
  children: ReactNode;
}) {
  const s = useRowState();
  const here = s.open === row && (!focus || s.focus === focus);
  return (
    <button
      type="button"
      className={className}
      aria-expanded={s.open === row}
      aria-controls={`details-${row}`}
      data-row-open={row}
      data-row-focus={focus}
      onClick={() =>
        here ? closeRow() : set({ open: row, focus: focus ?? null })
      }
      {...props}
    >
      {children}
    </button>
  );
}

/** The details themselves, rendered under the row only while open. */
export function RowDetails({
  row,
  label,
  children,
}: {
  row: string;
  label: string;
  children: ReactNode;
}) {
  const s = useRowState();
  const open = s.open === row;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const el = root.current;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const target = el?.querySelector<HTMLElement>(
      s.focus
        ? `[data-row-tab-panel] input:not([type=hidden]), [data-row-tab-panel] select`
        : '[data-row-heading]',
    );
    target?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el?.contains(document.activeElement)) {
        e.preventDefault();
        closeRow();
        document
          .querySelector<HTMLElement>(
            `[data-row-open="${row}"]:not([data-row-focus])`,
          )
          ?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, row, s.focus]);
  if (!open) return null;
  return (
    <div
      id={`details-${row}`}
      ref={root}
      className="row-details"
      role="region"
      aria-label={label}
    >
      <span className="sr-only" tabIndex={-1} data-row-heading>
        {label}
      </span>
      <RowFocus.Provider value={s.focus}>
        <DisclosureContext.Provider value={{ close: closeRow }}>
          {children}
        </DisclosureContext.Provider>
      </RowFocus.Provider>
    </div>
  );
}

/** Log time · Edit as two small toggles sharing one place; the row's focus picks the first. */
export function RowTabs({
  items,
}: {
  items: { key: string; label: string; content: ReactNode }[];
}) {
  const focus = useContext(RowFocus);
  const [chosen, setChosen] = useState<string | null>(focus);
  const [seen, setSeen] = useState(focus);
  // A second Log time or Reschedule on an open row switches the tab.
  if (seen !== focus) {
    setSeen(focus);
    setChosen(focus);
  }
  const active = items.find((item) => item.key === chosen) ?? null;
  return (
    <div className="row-tabs">
      <div className="disclosure-tabs">
        {items.map((item) => (
          <button
            type="button"
            key={item.key}
            className="disclosure-link"
            aria-expanded={chosen === item.key}
            onClick={() => setChosen(chosen === item.key ? null : item.key)}
          >
            {item.label}
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="disclosure-chevron"
            />
          </button>
        ))}
      </div>
      {active && (
        <div className="row-tab-panel" data-row-tab-panel key={active.key}>
          {active.content}
        </div>
      )}
    </div>
  );
}
