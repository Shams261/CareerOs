'use client';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { closePanel, openPanel } from '@/components/side-panel';
import { addNoteAction } from '@/features/notes/actions';
import { OPEN_ITEM_EVENT } from '@/features/roadmap/events';
import {
  noteCommand,
  openKeyLabel,
  PLACES,
  rankCommands,
  type Command,
} from './domain';

const OPEN_EVENT = 'silsila:command';
const noop = () => () => undefined;
const platform = () =>
  (navigator as unknown as { userAgentData?: { platform?: string } })
    .userAgentData?.platform ?? navigator.platform;
/** "⌘K" on Apple devices, "Ctrl K" elsewhere; "⌘K" in the server HTML. */
export const useOpenKey = () =>
  useSyncExternalStore(
    noop,
    () => openKeyLabel(platform()),
    () => '⌘K',
  );

/**
 * Once the page a command opens is showing, opens its side panel or presses its control. Panels
 * close when the address changes, so this waits for the new address and the opener first.
 */
function afterNavigation(command: Command, target: URL) {
  const started = Date.now();
  const tick = () => {
    const there =
      location.pathname === target.pathname &&
      location.search === target.search;
    if (there && command.panel) {
      const opener = document.querySelector<HTMLElement>(
        `[data-panel="${command.panel}"]`,
      );
      // A narrow screen may keep the opener in a closed menu; the panel still opens.
      if (opener || Date.now() - started > 1500) {
        openPanel(command.panel, opener);
        return;
      }
    }
    if (there && command.press) {
      const el = document.querySelector<HTMLElement>(command.press);
      if (el) {
        el.click();
        el.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
    if (Date.now() - started < 5000) setTimeout(tick, 100);
  };
  tick();
}

/** Opens the command bar from a button (the sidebar and the phone bar). */
export function CommandButton({ className }: { className?: string }) {
  const key = useOpenKey();
  return (
    <button
      type="button"
      className={className}
      aria-label="Search"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      <Search size={16} aria-hidden="true" />
      <span>Search</span>
      <kbd aria-hidden="true">{key}</kbd>
    </button>
  );
}

/**
 * The command bar (WI-036): ⌘K or Ctrl K anywhere, or the Search button. Typing finds today's
 * blocks, roadmap items, problems, applications and places; ↑ ↓ move, Enter runs, Esc closes.
 * Running a command only opens a page, a panel or a control the owner then uses, except
 * "Add a note", which saves the typed words as a note to self.
 */
export function CommandBar() {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [today, setToday] = useState<Command[]>([]);
  const [found, setFound] = useState<{ q: string; commands: Command[] }>({
    q: '',
    commands: [],
  });
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const openKey = useOpenKey();

  const show = useCallback(() => {
    closePanel();
    returnTo.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setActive(0);
    setStatus('');
    setOpen(true);
    fetch('/api/command', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { commands: [] }))
      .then((d: { commands: Command[] }) => setToday(d.commands))
      .catch(() => setToday([]));
  }, []);
  const hide = useCallback((restore = true) => {
    setOpen(false);
    if (restore)
      setTimeout(() => {
        if (returnTo.current?.isConnected) returnTo.current.focus();
      }, 0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        if (open) hide();
        else show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [open, show, hide]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // The search waits for a short pause in typing; an answer for older words is dropped.
  useEffect(() => {
    const q = query.trim();
    if (!open || !q) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
        cache: 'no-store',
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : { commands: [] }))
        .then((d: { commands: Command[] }) =>
          setFound({ q, commands: d.commands }),
        )
        .catch(() => undefined);
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const results = useMemo(() => {
    const q = query.trim();
    const note = noteCommand(q);
    return rankCommands(
      [
        ...today,
        ...(q && found.q === q ? found.commands : []),
        ...PLACES,
        ...(note ? [note] : []),
      ],
      q,
    );
  }, [query, today, found]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  const run = async (command: Command) => {
    if (command.note) {
      const form = new FormData();
      form.set('body', command.note);
      const result = await addNoteAction({ message: '' }, form);
      setStatus(result.message);
      if (result.ok) setQuery('');
      return;
    }
    if (!command.href) return;
    hide(false);
    const target = new URL(command.href, location.origin);
    if (
      location.pathname === target.pathname &&
      location.search === target.search
    ) {
      // Same page: a new hash opens a roadmap item without a reload; the event opens it even
      // when the hash is already there and another row was opened since.
      if (target.hash && location.hash !== target.hash)
        location.hash = target.hash;
      if (target.hash.startsWith('#item-'))
        window.dispatchEvent(
          new CustomEvent(OPEN_ITEM_EVENT, {
            detail: target.hash.slice('#item-'.length),
          }),
        );
    } else router.push(command.href);
    if (command.panel || command.press) afterNavigation(command, target);
  };

  if (!open) return null;
  const optionId = (i: number) => `${id}-option-${i}`;
  return createPortal(
    <div className="command-backdrop" onClick={() => hide()}>
      <div
        className="command"
        role="dialog"
        aria-modal="true"
        aria-label="Command bar"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          className="command-input"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={results.length ? optionId(current) : undefined}
          aria-label="Search or run a command"
          placeholder="Search or run a command"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setStatus('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (!results.length) return;
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setActive((current + step + results.length) % results.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (results[current]) void run(results[current]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              hide();
            }
          }}
        />
        <div className="command-list" id={`${id}-list`} role="listbox">
          {results.length === 0 && (
            <p className="command-empty">Nothing matches</p>
          )}
          {[...new Set(results.map((r) => r.group))].map((group) => (
            <div
              key={group}
              role="group"
              aria-labelledby={`${id}-${group}`}
              className="command-group"
            >
              <p className="eyebrow" id={`${id}-${group}`} role="presentation">
                {group}
              </p>
              {results
                .filter((r) => r.group === group)
                .map((r) => {
                  const i = results.indexOf(r);
                  return (
                    <div
                      key={r.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === current}
                      className="command-option"
                      onMouseMove={() => i !== current && setActive(i)}
                      onClick={() => void run(r)}
                    >
                      <span className="command-text">
                        <strong>
                          {r.verb}
                          {r.title ? ` · ${r.title}` : ''}
                        </strong>
                        {r.meta && <span> {r.meta}</span>}
                      </span>
                      {i === current && (
                        <kbd className="command-enter" aria-hidden="true">
                          ↵
                        </kbd>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
        <p className="command-foot">
          <span aria-hidden="true">↑↓ move · ↵ run · Esc close</span>
          <span role="status">{status}</span>
          <span aria-hidden="true">{openKey} anywhere</span>
        </p>
      </div>
    </div>,
    document.body,
  );
}
