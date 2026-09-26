import type { CalendarConfig } from '../../lib/env';

/** The subset of Google Calendar v3 used by Silsila (ADR-010). */
export type GoogleDateTime = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};
export type GoogleEvent = {
  id: string;
  etag?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  start?: GoogleDateTime;
  end?: GoogleDateTime;
  updated?: string;
  extendedProperties?: { private?: Record<string, string> };
};
export type EventPage = {
  items: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};
export type EventWrite = Partial<Omit<GoogleEvent, 'etag' | 'updated'>>;

export type GoogleErrorKind =
  | 'auth'
  | 'gone'
  | 'notFound'
  | 'conflict'
  | 'precondition'
  | 'transient'
  | 'invalid';
export class GoogleApiError extends Error {
  constructor(
    public kind: GoogleErrorKind,
    public status: number,
    public reason?: string,
  ) {
    // Only status and Google's reason code: never bodies, URLs with tokens, or headers.
    super(`Google API ${status}${reason ? ` ${reason}` : ''}`);
  }
}

export interface CalendarApi {
  createCalendar(
    summary: string,
    timeZone: string,
  ): Promise<{ id: string; summary: string }>;
  getCalendar(id: string): Promise<{ id: string; summary: string } | null>;
  deleteCalendar(id: string): Promise<void>;
  listEvents(
    calendarId: string,
    opts: { pageToken?: string; syncToken?: string },
  ): Promise<EventPage>;
  getEvent(calendarId: string, eventId: string): Promise<GoogleEvent | null>;
  insertEvent(calendarId: string, event: EventWrite): Promise<GoogleEvent>;
  patchEvent(
    calendarId: string,
    eventId: string,
    patch: EventWrite,
    etag?: string | null,
  ): Promise<GoogleEvent>;
  deleteEvent(
    calendarId: string,
    eventId: string,
    etag?: string | null,
  ): Promise<void>;
  watchEvents(
    calendarId: string,
    channel: { id: string; address: string; token: string; ttlSeconds: number },
  ): Promise<{ resourceId: string; expiration: Date }>;
  stopChannel(channelId: string, resourceId: string): Promise<void>;
}
export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  idToken?: string;
};
export interface OAuthApi {
  authorizationUrl(state: string, codeChallenge: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  revoke(token: string): Promise<void>;
}

/** Only the calendars this app creates, plus the account email for display. */
export const CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar.app.created';
export const OAUTH_SCOPES = ['openid', 'email', CALENDAR_SCOPE];

const TRANSIENT_403 = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);
export function classify(status: number, reason?: string): GoogleErrorKind {
  if (status === 401) return 'auth';
  if (status === 403)
    return reason && TRANSIENT_403.has(reason) ? 'transient' : 'auth';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 410) return 'gone';
  if (status === 412) return 'precondition';
  if (status === 429 || status >= 500) return 'transient';
  return 'invalid';
}

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export type HttpOptions = {
  fetch?: typeof fetch;
  sleep?: Sleep;
  maxAttempts?: number;
};

async function reasonOf(res: Response) {
  try {
    const body = (await res.json()) as {
      error?: string | { errors?: { reason?: string }[]; status?: string };
    };
    if (typeof body.error === 'string') return body.error; // OAuth endpoints: invalid_grant etc.
    return body.error?.errors?.[0]?.reason ?? body.error?.status;
  } catch {
    return undefined;
  }
}
/** Bounded exponential backoff for 429/5xx/rate-limit 403, honouring Retry-After (capped). */
export async function requestWithRetry(
  url: string,
  init: RequestInit,
  { fetch: f = fetch, sleep = realSleep, maxAttempts = 4 }: HttpOptions = {},
) {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await f(url, init);
    } catch {
      if (attempt >= maxAttempts)
        throw new GoogleApiError('transient', 0, 'network');
      await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
      continue;
    }
    if (res.ok) return res;
    const reason = await reasonOf(res);
    const kind =
      reason === 'invalid_grant' ? 'auth' : classify(res.status, reason);
    if (kind !== 'transient' || attempt >= maxAttempts)
      throw new GoogleApiError(kind, res.status, reason);
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(
      Math.min(
        8000,
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100),
      ),
    );
  }
}

export function googleOAuth(
  config: CalendarConfig,
  http: HttpOptions = {},
): OAuthApi {
  const form = (body: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const tokens = async (body: Record<string, string>) => {
    const res = await requestWithRetry(config.tokenUrl, form(body), http);
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      scope?: string;
      id_token?: string;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      scope: json.scope,
      idToken: json.id_token,
    };
  };
  return {
    authorizationUrl(state, codeChallenge) {
      const u = new URL(config.authUrl);
      for (const [k, v] of Object.entries({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: OAUTH_SCOPES.join(' '),
        access_type: 'offline',
        // consent guarantees a refresh token on reconnect as well as first connect
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }))
        u.searchParams.set(k, v);
      return u.toString();
    },
    exchangeCode: (code, codeVerifier) =>
      tokens({
        code,
        code_verifier: codeVerifier,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
    refresh: (refreshToken) =>
      tokens({
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      }),
    async revoke(token) {
      await requestWithRetry(config.revokeUrl, form({ token }), http);
    },
  };
}

export function googleCalendar(
  config: CalendarConfig,
  accessToken: () => Promise<string>,
  http: HttpOptions = {},
): CalendarApi {
  const base = config.apiUrl;
  const call = async <T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> => {
    const res = await requestWithRetry(
      `${base}${path}`,
      {
        method,
        headers: {
          authorization: `Bearer ${await accessToken()}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      http,
    );
    return (res.status === 204 ? undefined : await res.json()) as T;
  };
  const cal = (id: string) => `/calendars/${encodeURIComponent(id)}`;
  const ev = (c: string, e: string) =>
    `${cal(c)}/events/${encodeURIComponent(e)}`;
  const orNull = async <T>(p: Promise<T>) => {
    try {
      return await p;
    } catch (e) {
      if (
        e instanceof GoogleApiError &&
        (e.kind === 'notFound' || e.kind === 'gone')
      )
        return null;
      throw e;
    }
  };
  return {
    createCalendar: (summary, timeZone) =>
      call('POST', '/calendars', { summary, timeZone }),
    getCalendar: (id) => orNull(call('GET', cal(id))),
    async deleteCalendar(id) {
      await orNull(call('DELETE', cal(id)));
    },
    listEvents(calendarId, { pageToken, syncToken }) {
      // Identical parameters on full and incremental lists; syncToken forbids filters.
      const q = new URLSearchParams({ showDeleted: 'true', maxResults: '250' });
      if (pageToken) q.set('pageToken', pageToken);
      if (syncToken) q.set('syncToken', syncToken);
      return call('GET', `${cal(calendarId)}/events?${q}`).then((r) => {
        const page = r as EventPage;
        return { ...page, items: page.items ?? [] };
      });
    },
    getEvent: (c, e) => orNull(call('GET', ev(c, e))),
    insertEvent: (c, event) => call('POST', `${cal(c)}/events`, event),
    patchEvent: (c, e, patch, etag) =>
      call('PATCH', ev(c, e), patch, etag ? { 'if-match': etag } : {}),
    async deleteEvent(c, e, etag) {
      await orNull(
        call('DELETE', ev(c, e), undefined, etag ? { 'if-match': etag } : {}),
      );
    },
    async watchEvents(calendarId, ch) {
      const r = await call<{ resourceId: string; expiration: string }>(
        'POST',
        `${cal(calendarId)}/events/watch`,
        {
          id: ch.id,
          type: 'web_hook',
          address: ch.address,
          token: ch.token,
          params: { ttl: String(ch.ttlSeconds) },
        },
      );
      return {
        resourceId: r.resourceId,
        expiration: new Date(Number(r.expiration)),
      };
    },
    async stopChannel(channelId, resourceId) {
      await orNull(
        call('POST', '/channels/stop', { id: channelId, resourceId }),
      );
    },
  };
}

/**
 * Reads the email claim from an ID token received directly from Google's token endpoint over TLS
 * (OpenID Connect permits skipping signature validation in that case). Display only; never trusted
 * for authorization.
 */
export function idTokenEmail(idToken?: string) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'),
    ) as { email?: string };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}
