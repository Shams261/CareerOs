'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sun,
  Code2,
  BookOpen,
  Briefcase,
  CalendarDays,
  ChartNoAxesCombined,
  Settings,
} from 'lucide-react';
const items = [
  ['/today', 'Today', Sun],
  ['/dsa', 'DSA', Code2],
  ['/learn', 'Learn', BookOpen],
  ['/jobs', 'Jobs', Briefcase],
  ['/calendar', 'Calendar', CalendarDays],
  ['/review', 'Review', ChartNoAxesCombined],
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
          aria-current={path === href ? 'page' : undefined}
        >
          <Icon size={17} />
          {title}
        </Link>
      ))}
    </nav>
  );
}
