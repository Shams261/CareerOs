import { describe, expect, it, vi } from 'vitest';
import {
  blockSyncView,
  decide,
  eligible,
  eventBody,
  fingerprint,
  inWindow,
  syncGenerationDays,
  localSnapshot,
  managedBlockId,
  newEventId,
  remoteSnapshot,
  PROP,
} from '../src/features/calendar/domain';
import {
  classify,
  googleCalendar,
  googleOAuth,
  requestWithRetry,
  GoogleApiError,
  CALENDAR_SCOPE,
} from '../src/features/calendar/google';
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
  TokenDecryptionError,
} from '../src/lib/token-crypto';
import type { CalendarConfig } from '../src/lib/env';

const block = {
  id: 'blk1',
  title: 'DSA',
  category: 'DSA',
  status: 'PLANNED',
  plannedStart: new Date('2026-11-01T05:30:00Z'), // 01:30 EDT, the repeated hour in Toronto
  plannedEnd: new Date('2026-11-01T07:00:00Z'), // 02:00 EST
};

describe('event mapping', () => {
  it('maps exact instants with the owner zone and a minimal description', () => {
    const body = eventBody(block, 'America/Toronto');
    expect(body.start).toEqual({
      dateTime: '2026-11-01T05:30:00.000Z',
      timeZone: 'America/Toronto',
    });
    expect(body.end?.dateTime).toBe('2026-11-01T07:00:00.000Z');
    expect(body.description).toBe('Managed by CareerOS\nCategory: DSA');
    expect(body.extendedProperties?.private).toEqual({
      [PROP.managed]: '1',
      [PROP.block]: 'blk1',
      [PROP.version]: '1',
    });
    expect(JSON.stringify(body)).not.toMatch(
      /notes|mistake|recruiter|compensation/i,
    );
  });
  it('reads Google offsets as exact instants across Toronto DST', () => {
    const snap = remoteSnapshot({
      id: 'e',
      summary: 'DSA',
      start: { dateTime: '2026-03-08T03:30:00-04:00' }, // just after spring-forward
      end: { dateTime: '2026-03-08T04:30:00-04:00' },
    });
    expect(snap).toEqual({
      title: 'DSA',
      start: '2026-03-08T07:30:00.000Z',
      end: '2026-03-08T08:30:00.000Z',
      cancelled: false,
    });
    expect(
      remoteSnapshot({
        id: 'e',
        summary: 'x',
        start: { dateTime: '2026-01-15T09:00:00-05:00' },
        end: { dateTime: '2026-01-15T10:00:00-05:00' },
      })!.start,
    ).toBe('2026-01-15T14:00:00.000Z');
  });
  it('rejects shapes a TimeBlock cannot hold and recognises deletions', () => {
    expect(
      remoteSnapshot({
        id: 'e',
        summary: 'All day',
        start: { date: '2026-01-15' },
        end: { date: '2026-01-16' },
      }),
    ).toBeNull();
    expect(
      remoteSnapshot({
        id: 'e',
        summary: '  ',
        start: { dateTime: '2026-01-15T09:00:00Z' },
        end: { dateTime: '2026-01-15T10:00:00Z' },
      }),
    ).toBeNull();
    expect(remoteSnapshot({ id: 'e', status: 'cancelled' })).toMatchObject({
      cancelled: true,
    });
  });
  it('proves ownership only through private properties, never titles', () => {
    expect(managedBlockId({ id: 'e', summary: 'DSA' })).toBeNull();
    expect(
      managedBlockId({
        id: 'e',
        extendedProperties: { private: { [PROP.block]: 'b' } },
      }),
    ).toBeNull();
    expect(
      managedBlockId({
        id: 'e',
        extendedProperties: {
          private: { [PROP.managed]: '1', [PROP.block]: 'b' },
        },
      }),
    ).toBe('b');
  });
  it('generates client event IDs in Google base32hex', () => {
    const id = newEventId();
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(newEventId()).not.toBe(id);
  });
});

describe('eligibility and state', () => {
  it('syncs planned, completed and skipped blocks but not cancelled or excluded categories', () => {
    expect(eligible(block, [])).toBe(true);
    expect(eligible({ ...block, status: 'COMPLETED' }, [])).toBe(true);
    expect(eligible({ ...block, status: 'SKIPPED' }, [])).toBe(true);
    expect(eligible({ ...block, status: 'CANCELLED' }, [])).toBe(false);
    expect(eligible({ ...block, category: 'Personal' }, ['PERSONAL'])).toBe(
      false,
    );
    expect(
      eligible({ ...block, category: 'system-design' }, ['SYSTEM_DESIGN']),
    ).toBe(false);
  });
  it('limits outbound sync to 30 days back and 90 days ahead', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    const at = (days: number) => ({
      plannedStart: new Date(+now + days * 86400000),
      plannedEnd: new Date(+now + days * 86400000 + 3600000),
    });
    expect(inWindow(at(-31), now)).toBe(false);
    expect(inWindow(at(-29), now)).toBe(true);
    expect(inWindow(at(89), now)).toBe(true);
    expect(inWindow(at(91), now)).toBe(false);
  });
  it('generates only the rest of the current week; next week is prepared in the weekly review', () => {
    expect(syncGenerationDays('2026-09-24')).toEqual([
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(syncGenerationDays('2026-09-27')).toEqual(['2026-09-27']);
    expect(syncGenerationDays('2026-09-21')).toHaveLength(7);
  });
  it('decides with a three-way comparison and never last-writer-wins', () => {
    expect(decide('a', 'a', 'a')).toBe('noop');
    expect(decide('a', 'a', 'b')).toBe('pull');
    expect(decide('a', 'b', 'a')).toBe('push');
    expect(decide('a', 'b', 'b')).toBe('converged');
    expect(decide('a', 'b', 'c')).toBe('conflict');
  });
  it('derives pending/synced/conflict views without storing pending', () => {
    const synced = fingerprint(localSnapshot(block, true));
    const b = {
      ...block,
      externalCalendarEventId: 'e',
      externalCalendarId: 'cal',
      calendarSyncedHash: synced,
      calendarSyncStatus: 'SYNCED',
    };
    expect(blockSyncView(b, 'cal', [])).toBe('Synced');
    expect(blockSyncView({ ...b, title: 'Renamed' }, 'cal', [])).toBe(
      'Pending',
    );
    expect(
      blockSyncView({ ...b, externalCalendarEventId: null }, 'cal', []),
    ).toBe('Pending');
    expect(
      blockSyncView({ ...b, calendarSyncStatus: 'CONFLICT' }, 'cal', []),
    ).toBe('Conflict');
    expect(
      blockSyncView(
        { ...b, externalCalendarEventId: null, status: 'CANCELLED' },
        'cal',
        [],
      ),
    ).toBe('Not synced');
  });
});

describe('token encryption', () => {
  const key = parseEncryptionKey(Buffer.alloc(32, 7).toString('base64'));
  it('round-trips with authenticated encryption and a random IV', () => {
    const a = encryptSecret('refresh-token', key);
    expect(a).toMatch(/^v1:/);
    expect(a).not.toContain('refresh-token');
    expect(encryptSecret('refresh-token', key)).not.toBe(a);
    expect(decryptSecret(a, key)).toBe('refresh-token');
  });
  it('fails safely on a wrong key or tampering', () => {
    const a = encryptSecret('refresh-token', key);
    const other = parseEncryptionKey(Buffer.alloc(32, 9).toString('base64'));
    expect(() => decryptSecret(a, other)).toThrow(TokenDecryptionError);
    const parts = a.split(':');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join(':'), key)).toThrow(
      TokenDecryptionError,
    );
    try {
      decryptSecret(a, other);
    } catch (e) {
      expect(String(e)).not.toContain('refresh');
    }
  });
  it('validates key format at configuration time', () => {
    expect(() => parseEncryptionKey(undefined)).toThrow('not set');
    expect(() => parseEncryptionKey('short')).toThrow('32 random bytes');
  });
});

const config: CalendarConfig = {
  clientId: 'client',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:3000/api/calendar/oauth/callback',
  encryptionKey: Buffer.alloc(32, 1).toString('base64'),
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  apiUrl: 'https://www.googleapis.com/calendar/v3',
};
const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const sleep = vi.fn(async () => {});

describe('Google HTTP client', () => {
  it('requests only the app-created calendar scope with offline access, consent and PKCE', () => {
    const url = new URL(googleOAuth(config).authorizationUrl('st', 'ch'));
    expect(url.searchParams.get('scope')).toBe(
      `openid email ${CALENDAR_SCOPE}`,
    );
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('st');
  });
  it('retries 429/5xx/rate-limit 403 with backoff and honours Retry-After', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(429, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(
        json(403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }),
      )
      .mockResolvedValueOnce(json(200, { ok: true }));
    const res = await requestWithRetry('https://x', {}, { fetch: f, sleep });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledWith(2000);
  });
  it('does not retry permanent errors and gives up after bounded attempts', async () => {
    const once = (status: number, body: unknown) =>
      vi.fn().mockResolvedValue(json(status, body));
    const auth = once(403, { error: { errors: [{ reason: 'forbidden' }] } });
    await expect(
      requestWithRetry('https://x', {}, { fetch: auth, sleep }),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(auth).toHaveBeenCalledTimes(1);
    const grant = once(400, { error: 'invalid_grant' });
    await expect(
      requestWithRetry('https://x', {}, { fetch: grant, sleep }),
    ).rejects.toMatchObject({ kind: 'auth' });
    const down = once(503, {});
    await expect(
      requestWithRetry('https://x', {}, { fetch: down, sleep, maxAttempts: 3 }),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(down).toHaveBeenCalledTimes(3);
    expect(classify(410)).toBe('gone');
    expect(classify(412)).toBe('precondition');
  });
  it('lists with identical parameters for full and incremental sync and sends If-Match', async () => {
    const f = vi.fn<typeof fetch>(async () =>
      json(200, { items: [], nextSyncToken: 't' }),
    );
    const api = googleCalendar(config, async () => 'access', {
      fetch: f,
      sleep,
    });
    await api.listEvents('cal@x', {});
    await api.listEvents('cal@x', { syncToken: 'abc', pageToken: 'p2' });
    const [full, inc] = f.mock.calls.map((c) => new URL(c[0] as string));
    expect(full.searchParams.get('showDeleted')).toBe('true');
    expect(inc.searchParams.get('syncToken')).toBe('abc');
    for (const forbidden of [
      'timeMin',
      'timeMax',
      'privateExtendedProperty',
      'q',
      'updatedMin',
    ])
      expect(inc.searchParams.has(forbidden)).toBe(false);
    f.mockImplementationOnce(async () => json(200, { id: 'e', etag: '"2"' }));
    await api.patchEvent('cal@x', 'e', { summary: 'x' }, '"1"');
    const init = f.mock.calls.at(-1)![1] as RequestInit;
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer access',
    );
  });
  it('keeps secrets out of error messages', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        json(401, { error: { errors: [{ reason: 'authError' }] } }),
      );
    const err = await googleCalendar(config, async () => 'ya29.secret', {
      fetch: f,
      sleep,
    })
      .getEvent('c', 'e')
      .catch((e) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect(String(err.message)).not.toContain('ya29');
  });
});
