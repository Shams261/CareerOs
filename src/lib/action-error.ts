/**
 * Which errors may speak to the owner (WI-122). Services refuse with `new Error('<a sentence
 * for the owner>')` or a `UserError`; everything else (a TypeError, a Prisma error, anything
 * carrying a `code` or Next's `digest`) is unexpected, so its text never reaches the screen.
 */

/** An expected refusal whose message is written for the owner. */
export class UserError extends Error {
  name = 'UserError';
}

/** The owner-facing words of an error, or null when the error is unexpected. */
export function ownerWords(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if ('code' in error || 'digest' in error) return null;
  const plain = Object.getPrototypeOf(error) === Error.prototype;
  return (plain || error instanceof UserError) && error.message
    ? error.message
    : null;
}

/** A Prisma or pg error code, or '' (codes are safe to log; messages are not). */
export const errorCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

/** The fallback line with a short reference the owner can quote; the log carries the same. */
export const withReference = (fallback: string, ref: string) =>
  `${fallback} Reference ${ref}.`;
