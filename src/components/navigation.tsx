'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Sun,
  CalendarDays,
  Route,
  Code2,
  Briefcase,
  ClipboardCheck,
  Settings,
  Ellipsis,
  X,
} from 'lucide-react';
// Labels say what you do there; routes are unchanged. The first four are the daily places and
// form the phone bar; the rest sit behind More on a phone. Learn (/learn) stays reachable by URL
// and from item links but is off the menu since WI-012: the roadmap carries revision.
const items = [
  ['/today', 'Today', Sun],
  ['/calendar', 'Plan', CalendarDays],
  ['/roadmap', 'Roadmap', Route],
  ['/dsa', 'Practice', Code2],
  ['/jobs', 'Jobs', Briefcase],
  ['/review', 'Weekly review', ClipboardCheck],
  ['/settings', 'Settings', Settings],
] as const;
/** The phone bar: the places used daily; the rest sit behind More. */
const PHONE = ['/today', '/roadmap', '/dsa', '/jobs'] as const;
const bar = PHONE.map((href) => items.find((i) => i[0] === href)!);
const rest = items.filter(
  ([href]) => !(PHONE as readonly string[]).includes(href),
);

export function Navigation({ capture }: { capture?: ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  // The sheet closes on navigation (derived from the previous path) and on Escape.
  const [seenPath, setSeenPath] = useState(path);
  if (path !== seenPath) {
    setSeenPath(path);
    setMore(false);
  }
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [more]);
  const current = (href: string) =>
    path === href || path.startsWith(`${href}/`) ? 'page' : undefined;
  const moreIsCurrent = rest.some(([href]) => current(href));
  return (
    <>
      <nav className="nav" aria-label="Main navigation">
        {items.map(([href, title, Icon]) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={current(href)}
          >
            <Icon size={18} aria-hidden="true" />
            {title}
          </Link>
        ))}
      </nav>
      <nav className="nav-bar" aria-label="Main navigation">
        {bar.map(([href, title, Icon]) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={current(href)}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{title}</span>
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={more}
          aria-controls="nav-more"
          aria-current={!more && moreIsCurrent ? 'page' : undefined}
          onClick={() => setMore((m) => !m)}
        >
          {more ? (
            <X size={20} aria-hidden="true" />
          ) : (
            <Ellipsis size={20} aria-hidden="true" />
          )}
          <span>{more ? 'Close' : 'More'}</span>
        </button>
      </nav>
      {more && (
        <div className="nav-more" id="nav-more" role="dialog" aria-label="More">
          {capture}
          {rest.map(([href, title, Icon]) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={current(href)}
            >
              <Icon size={18} aria-hidden="true" />
              {title}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
