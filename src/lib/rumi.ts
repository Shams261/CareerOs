/**
 * What any feature may say to Rumi without importing Rumi (WI-144): its name on screen, the flag
 * the drawer sets on <body>, and the study handover. In the kernel so a feature that Rumi reads
 * (the roadmap) can open Rumi without the two features importing each other.
 */
export const AGENT_NAME = 'Rumi';
/** Set on <body> while the drawer is available on this page. */
export const DRAWER_FLAG = 'rumiDrawer';

/**
 * Study with Rumi from a roadmap item (WI-144): Grill me, Read it to me, or Explain it. The
 * drawer shows Grill me and Read it to me as a card in the chat and sends Explain it as a
 * question. The card is never stored, like the tools themselves (ADR-022, ADR-023); only Keep
 * as card keeps rungs.
 */
export const STUDY_EVENT = 'silsila:rumi-study';
export type StudyRequest = {
  kind: 'grill' | 'listen' | 'explain';
  item: {
    id: string;
    title: string;
    scope: string | null;
    checkpoint: string | null;
    references: unknown;
  };
  budget: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
  revisionDue: boolean;
};
/** Opens the drawer on the request; false where this page has no drawer. */
export function studyWithRumi(request: StudyRequest) {
  if (document.body.dataset[DRAWER_FLAG] !== 'on') return false;
  window.dispatchEvent(new CustomEvent(STUDY_EVENT, { detail: request }));
  return true;
}
/** The question Explain it sends: the item's title and what it covers. */
export const explainQuestion = (item: StudyRequest['item']) =>
  `Explain ${item.title}${item.scope ? ` (${item.scope.replace(/\s+/g, ' ').trim().slice(0, 300)})` : ''} the way you would to someone preparing for an interview, with an example.`;
