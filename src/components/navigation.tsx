'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sun,
  CalendarDays,
  Route,
  Code2,
  BookOpen,
  Briefcase,
  ClipboardCheck,
  Settings,
} from 'lucide-react';
// Labels say what you do there; routes are unchanged.
const items = [
  ['/today', 'Today', Sun],
  ['/calendar', 'Plan', CalendarDays],
  ['/roadmap', 'Roadmap', Route],
  ['/dsa', 'Practice', Code2],
  ['/learn', 'Learn', BookOpen],
  ['/jobs', 'Jobs', Briefcase],
  ['/review', 'Weekly review', ClipboardCheck],
  ['/settings', 'Settings', Settings],
] as const;
export function Navigation() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main navigation">
      {items.map(([href, title, Icon]) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          aria-current={
            path === href || path.startsWith(`${href}/`) ? 'page' : undefined
          }
        >
          <Icon size={18} aria-hidden="true" />
          {title}
        </Link>
      ))}
    </nav>
  );
}
