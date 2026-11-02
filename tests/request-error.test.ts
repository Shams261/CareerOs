import { describe, expect, it } from 'vitest';
import { requestErrorLine } from '../src/lib/request-error';

describe('requestErrorLine (WI-138)', () => {
  it('names the route, the class, the code and the reference only', () => {
    const error = Object.assign(new TypeError('owner@example.com said hi'), {
      code: 'P2002',
      digest: '2093874561',
    });
    const line = requestErrorLine(error, {
      routeType: 'render',
      routePath: '/jobs/[id]',
    });
    expect(line).toBe(
      '[request] failed render /jobs/[id] TypeError P2002 ref 2093874561',
    );
    expect(line).not.toContain('owner@example.com');
  });

  it('leaves out what it does not know', () => {
    expect(requestErrorLine('boom', {})).toBe('[request] failed unknown Error');
  });

  it("stays quiet for Next's redirects and not-found", () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    expect(requestErrorLine(redirect, { routeType: 'render' })).toBeNull();
    const missing = Object.assign(new Error('x'), {
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
    expect(requestErrorLine(missing, { routeType: 'render' })).toBeNull();
  });
});
