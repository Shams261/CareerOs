import { errorCode } from './action-error';

/**
 * One log line for a server error Next caught while rendering a page, running a route or an
 * action (WI-138, `onRequestError` in `src/instrumentation.ts`): where (the route's file path,
 * never the request's own path or query), the error's class and code, and the digest the error
 * page shows the owner as "Reference …". Never the message, the stack, headers or a body.
 * Next's own control flow (a redirect, a not-found) is not an error and returns null.
 */
export function requestErrorLine(
  error: unknown,
  context: { routeType?: string; routePath?: string },
): string | null {
  const digest =
    error && typeof error === 'object' && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : '';
  if (digest.startsWith('NEXT_')) return null;
  return [
    '[request] failed',
    context.routeType ?? 'unknown',
    context.routePath ?? '',
    error instanceof Error ? error.name : 'Error',
    errorCode(error),
    digest ? `ref ${digest}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
