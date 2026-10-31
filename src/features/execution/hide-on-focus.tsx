'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Focus is the session: the sidebar's running card would double its Pause and Complete
 * there (WI-098), so it hides on /focus and stays mounted, keeping the pop-out alive.
 */
export function HideOnFocus({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div hidden={pathname === '/focus'}>{children}</div>;
}
