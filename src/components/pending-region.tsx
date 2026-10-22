'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from 'react';

/**
 * A region whose filters and navigation run inside one React transition (WI-015). While the
 * new page is on its way the region is marked `aria-busy` and `is-pending`, so a section
 * switch or a filter change on a cross-region round trip never looks frozen.
 *
 * `isPending` alone misses navigations that resolve outside the transition, so the region
 * also remembers the URL a navigation started from and stays pending until the URL changes
 * (or eight seconds pass, in case the navigation lands on the same URL).
 */
const Ctx = createContext<{ start: (work: () => void) => void }>({
  start: (work) => work(),
});
export const usePendingRegion = () => useContext(Ctx);
const STUCK_MS = 8000;

export function PendingRegion({
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}: {
  as?: 'div' | 'section';
  className?: string;
  children: ReactNode;
  id?: string;
  'aria-labelledby'?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const params = useSearchParams();
  const here = `${pathname}?${params.toString()}`;
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  const pending = isPending || (startedFrom !== null && startedFrom === here);
  const start = (work: () => void) => {
    setStartedFrom(here);
    setTimeout(() => setStartedFrom((s) => (s === here ? null : s)), STUCK_MS);
    startTransition(work);
  };
  return (
    <Tag
      className={`${className}${pending ? ' is-pending' : ''}`}
      aria-busy={pending || undefined}
      {...rest}
    >
      <Ctx.Provider value={{ start }}>{children}</Ctx.Provider>
    </Tag>
  );
}
