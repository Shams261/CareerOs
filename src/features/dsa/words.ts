/**
 * Confidence in plain words (WI-063): the stored values stay RED, YELLOW and GREEN; the screen
 * says how sure the owner is, so nobody has to learn a colour code. No imports, so client
 * components can use it without the domain's validation code.
 */
export const CONFIDENCE_WORD = {
  RED: 'Shaky',
  YELLOW: 'Okay',
  GREEN: 'Solid',
} as const;
export type ConfidenceValue = keyof typeof CONFIDENCE_WORD;
export const confidenceWord = (c: ConfidenceValue) => CONFIDENCE_WORD[c];
