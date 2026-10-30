import type { ItemOp, ItemStatus } from './domain';

/**
 * The roadmap as an outline and a reading pane (WI-084): the pure rules for which item the
 * pane shows, which sections the outline opens, and where Prev and Next go.
 */
export type PaneRow = {
  id: string;
  section: string;
  status: ItemStatus;
  /** The outline lists the row; a row filtered out by search or Show is still readable. */
  shown: boolean;
};

/**
 * The item the pane shows on arrival: the one named in the hash, else the first item not done
 * in the section asked for, else the Continue item, else the first row the outline shows.
 */
export function initialItem(
  rows: PaneRow[],
  input: { hash: string | null; section: string | null; next: string | null },
) {
  const has = (id: string | null) => !!id && rows.some((r) => r.id === id);
  if (has(input.hash)) return input.hash;
  if (input.section) {
    const inSection = rows.filter(
      (r) => r.section === input.section && r.shown,
    );
    const open = inSection.find((r) => r.status !== 'DONE') ?? inSection[0];
    if (open) return open.id;
  }
  if (has(input.next)) return input.next;
  return rows.find((r) => r.shown)?.id ?? null;
}

/** Prev and Next walk the rows the outline shows, in outline order. */
export function adjacent(rows: PaneRow[], id: string | null) {
  const shown = rows.filter((r) => r.shown || r.id === id);
  const i = shown.findIndex((r) => r.id === id);
  return {
    prev: i > 0 ? shown[i - 1] : null,
    next: i >= 0 && i < shown.length - 1 ? shown[i + 1] : null,
  };
}

/**
 * The sections open on arrival: the open item's, the one the link asked for, and every section
 * holding a match while a search is on (so the matches are all in view).
 */
export function openSections(
  rows: PaneRow[],
  input: { openId: string | null; section: string | null; q: string },
) {
  const open = new Set<string>();
  const current = rows.find((r) => r.id === input.openId);
  if (current) open.add(current.section);
  if (input.section) open.add(input.section);
  if (input.q) for (const r of rows) if (r.shown) open.add(r.section);
  return [...open];
}

/**
 * The op a choice on the status control sends from the current status; null for the choice
 * already made. Done starts revision as before; Studying from done reopens.
 */
export function statusOp(
  choice: ItemStatus,
  current: ItemStatus,
): ItemOp | null {
  if (choice === current) return null;
  if (choice === 'NOT_STARTED') return 'unstart';
  if (choice === 'DONE') return 'done';
  return current === 'DONE' ? 'reopen' : 'start';
}
