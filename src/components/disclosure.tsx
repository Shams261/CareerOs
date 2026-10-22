'use client';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { hasDraft, subscribeDrafts } from './drafts';

type Variant = 'primary' | 'secondary' | 'link';
export const DisclosureContext = createContext<{ close: () => void } | null>(
  null,
);
/** The nearest Disclosure, so a form can close it after a successful save. */
export const useDisclosure = () => useContext(DisclosureContext);

/**
 * A real button that opens content in place. Replaces `<details>` for forms so the
 * primary action on a page is visible and keyboard users land on the first field.
 */
export function Disclosure({
  label,
  children,
  variant = 'secondary',
  defaultOpen = false,
  className = '',
  shortcut,
  draft,
}: {
  label: string;
  children: ReactNode;
  variant?: Variant;
  defaultOpen?: boolean;
  className?: string;
  /** A `data-shortcut` name so a keyboard shortcut can press this trigger. */
  shortcut?: string;
  /** The form inside keeps a draft under this key: the panel opens while one exists. */
  draft?: string;
}) {
  const kept = useSyncExternalStore(
    subscribeDrafts,
    () => (draft ? hasDraft(draft) : false),
    () => false,
  );
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? (defaultOpen || kept);
  const setOpen = (next: boolean) => setChosen(next);
  const [userOpened, setUserOpened] = useState(false);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !userOpened) return;
    panel.current
      ?.querySelector<HTMLElement>(
        'input:not([type=hidden]), select, textarea, button',
      )
      ?.focus();
  }, [open, userOpened]);
  return (
    <div
      className={`disclosure${open ? ' is-open' : ''}${variant === 'link' ? ' is-link' : ''} ${className}`}
    >
      <button
        type="button"
        className={
          variant === 'link'
            ? 'disclosure-link'
            : `button disclosure-trigger${variant === 'secondary' ? ' secondary' : ''}`
        }
        aria-expanded={open}
        aria-controls={id}
        data-shortcut={shortcut}
        onClick={() => {
          setUserOpened(true);
          setOpen(!open);
        }}
      >
        {label}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="disclosure-chevron"
        />
      </button>
      {open && (
        <div id={id} ref={panel} className="disclosure-panel">
          <DisclosureContext.Provider value={{ close: () => setOpen(false) }}>
            {children}
          </DisclosureContext.Provider>
        </div>
      )}
    </div>
  );
}

/** A row of small toggles sharing one panel: "Edit this day · Log time". */
export function DisclosureTabs({
  items,
  className = '',
}: {
  items: { label: string; content: ReactNode }[];
  className?: string;
}) {
  // Remembered by label, so a tab that disappears after its action closes the
  // panel instead of handing its slot to the next tab.
  const [chosen, setChosen] = useState<string | null>(null);
  const active = items.some((item) => item.label === chosen) ? chosen : null;
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active === null) return;
    panel.current
      ?.querySelector<HTMLElement>(
        'input:not([type=hidden]), select, textarea, button',
      )
      ?.focus();
  }, [active]);
  return (
    <div className={`disclosure is-link ${className}`}>
      <div className="disclosure-tabs">
        {items.map((item) => (
          <button
            type="button"
            key={item.label}
            className="disclosure-link"
            aria-expanded={active === item.label}
            aria-controls={id}
            onClick={() => setChosen(active === item.label ? null : item.label)}
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
      {active !== null && (
        <div id={id} ref={panel} className="disclosure-panel">
          {items.find((item) => item.label === active)!.content}
        </div>
      )}
    </div>
  );
}
