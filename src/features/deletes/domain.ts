/**
 * Deletes on every record (WI-060). A deleted block is cancelled with this reason, so the
 * calendar sync removes its Google event; Today and Plan leave such blocks out.
 */
export const DELETED = 'Deleted';

/** A block the owner deleted: kept only so the sync can remove its event, and for Undo. */
export const isDeleted = (b: { status: string; skipReason?: string | null }) =>
  b.status === 'CANCELLED' && b.skipReason === DELETED;
