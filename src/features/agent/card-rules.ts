/** Plan-card rules the chat needs in the browser; no schemas here (WI-123). */
import type { Proposal } from './plan-domain';

/** The blocks Add to plan writes: none that conflict, and none the owner removed (WI-058). */
export const addable = (p: Proposal, skip: readonly number[] = []) =>
  p.blocks.filter((b, i) => !b.conflict && !skip.includes(i));
