import {
  GoogleApiError,
  CALENDAR_SCOPE,
  type CalendarApi,
  type EventPage,
  type EventWrite,
  type GoogleEvent,
  type OAuthApi,
  type TokenSet,
} from '../../src/features/calendar/google';

type Stored = GoogleEvent & { seq: number };
type Hook = (method: string, args: unknown[]) => void | 'after';

/**
 * In-memory Google Calendar with the behaviours sync relies on: etags + If-Match (412),
 * client IDs (409), tombstones for deleted events, paginated full/incremental lists with
 * nextSyncToken only on the last page, 410 for expired tokens, and failure injection.
 */
export class FakeGoogle {
  calendars = new Map<
    string,
    { id: string; summary: string; events: Map<string, Stored> }
  >();
  seq = 0;
  pageSize = 2;
  expiredBefore = 0;
  calls: { method: string; args: unknown[] }[] = [];
  channels = new Map<
    string,
    { resourceId: string; expiration: Date; stopped: boolean }
  >();
  revoked: string[] = [];
  refreshRevoked = false;
  grantedScope = `openid email ${CALENDAR_SCOPE}`;
  omitRefreshToken = false;
  hook: Hook | null = null;
  clock: () => Date = () => new Date();
  private pages = new Map<string, Stored[]>();
  private nextId = 0;

  private run(method: string, args: unknown[]) {
    this.calls.push({ method, args });
    return this.hook?.(method, args);
  }
  private cal(id: string) {
    const c = this.calendars.get(id);
    if (!c) throw new GoogleApiError('notFound', 404, 'notFound');
    return c;
  }
  private stamp(e: GoogleEvent): Stored {
    this.seq++;
    return {
      ...e,
      seq: this.seq,
      etag: `"etag-${this.seq}"`,
      updated: new Date().toISOString(),
    };
  }
  private clone = (e: Stored): GoogleEvent => {
    const { seq, ...rest } = e;
    void seq;
    return structuredClone(rest);
  };
  count(method: string) {
    return this.calls.filter((c) => c.method === method).length;
  }
  events(calendarId: string) {
    return [...this.cal(calendarId).events.values()].map(this.clone);
  }
  live(calendarId: string) {
    return this.events(calendarId).filter((e) => e.status !== 'cancelled');
  }

  // --- helpers that simulate a person using Google Calendar
  userEdit(calendarId: string, id: string, patch: Partial<GoogleEvent>) {
    const c = this.cal(calendarId);
    const e = c.events.get(id)!;
    c.events.set(id, this.stamp({ ...e, ...patch }));
  }
  userDelete(calendarId: string, id: string) {
    this.userEdit(calendarId, id, { status: 'cancelled' });
  }
  addForeign(calendarId: string, summary: string, start: string, end: string) {
    const id = `foreign${++this.nextId}`;
    this.cal(calendarId).events.set(
      id,
      this.stamp({
        id,
        summary,
        status: 'confirmed',
        start: { dateTime: start },
        end: { dateTime: end },
      }),
    );
    return id;
  }
  expireTokens() {
    this.expiredBefore = this.seq + 1;
  }

  oauth(): OAuthApi {
    return {
      authorizationUrl: (state, challenge) =>
        `https://accounts.example.test/auth?state=${state}&code_challenge=${challenge}`,
      exchangeCode: async (code, verifier): Promise<TokenSet> => {
        this.run('exchangeCode', [code, verifier]);
        return {
          accessToken: 'access-1',
          refreshToken: this.omitRefreshToken ? undefined : 'refresh-secret-1',
          scope: this.grantedScope,
          idToken: `x.${Buffer.from(JSON.stringify({ email: 'owner@example.com' })).toString('base64url')}.y`,
        };
      },
      refresh: async (token) => {
        this.run('refresh', [token]);
        if (this.refreshRevoked)
          throw new GoogleApiError('auth', 400, 'invalid_grant');
        return { accessToken: `access-for-${token.length}` };
      },
      revoke: async (token) => {
        this.run('revoke', [token]);
        this.revoked.push(token);
      },
    };
  }

  api(): CalendarApi {
    return {
      createCalendar: async (summary) => {
        this.run('createCalendar', [summary]);
        const id = `cal${++this.nextId}@group.calendar.google.com`;
        this.calendars.set(id, { id, summary, events: new Map() });
        return { id, summary };
      },
      getCalendar: async (id) => {
        this.run('getCalendar', [id]);
        const c = this.calendars.get(id);
        return c ? { id: c.id, summary: c.summary } : null;
      },
      deleteCalendar: async (id) => {
        this.run('deleteCalendar', [id]);
        this.calendars.delete(id);
      },
      listEvents: async (
        calendarId,
        { pageToken, syncToken },
      ): Promise<EventPage> => {
        this.run('listEvents', [calendarId, { pageToken, syncToken }]);
        let items: Stored[];
        const key = pageToken ?? `p${++this.nextId}`;
        if (pageToken) items = this.pages.get(pageToken) ?? [];
        else {
          const since = syncToken ? Number(syncToken.replace('tok-', '')) : 0;
          if (syncToken && since < this.expiredBefore)
            throw new GoogleApiError('gone', 410, 'fullSyncRequired');
          items = [...this.cal(calendarId).events.values()]
            .filter((e) => e.seq > since)
            .sort((a, b) => a.seq - b.seq);
        }
        const page = items.slice(0, this.pageSize);
        const rest = items.slice(this.pageSize);
        if (rest.length) {
          const next = `${key}+`;
          this.pages.set(next, rest);
          return { items: page.map(this.clone), nextPageToken: next };
        }
        return {
          items: page.map(this.clone),
          nextSyncToken: `tok-${this.seq}`,
        };
      },
      getEvent: async (c, id) => {
        this.run('getEvent', [c, id]);
        const e = this.cal(c).events.get(id);
        return e ? this.clone(e) : null;
      },
      insertEvent: async (c, event: EventWrite) => {
        const after = this.run('insertEvent', [c, event]);
        const cal = this.cal(c);
        if (event.id && cal.events.has(event.id))
          throw new GoogleApiError('conflict', 409, 'duplicate');
        const stored = this.stamp({
          status: 'confirmed',
          ...event,
          id: event.id ?? `gen${++this.nextId}`,
        });
        cal.events.set(stored.id, stored);
        if (after === 'after')
          throw new GoogleApiError('transient', 503, 'backendError');
        return this.clone(stored);
      },
      patchEvent: async (c, id, patch, etag) => {
        const after = this.run('patchEvent', [c, id, patch, etag]);
        const cal = this.cal(c);
        const e = cal.events.get(id);
        if (!e) throw new GoogleApiError('notFound', 404, 'notFound');
        if (etag && etag !== e.etag)
          throw new GoogleApiError('precondition', 412, 'conditionNotMet');
        const stored = this.stamp({ ...e, ...patch });
        cal.events.set(id, stored);
        if (after === 'after')
          throw new GoogleApiError('transient', 503, 'backendError');
        return this.clone(stored);
      },
      deleteEvent: async (c, id, etag) => {
        this.run('deleteEvent', [c, id, etag]);
        const cal = this.cal(c);
        const e = cal.events.get(id);
        if (!e || e.status === 'cancelled') return;
        if (etag && etag !== e.etag)
          throw new GoogleApiError('precondition', 412, 'conditionNotMet');
        cal.events.set(id, this.stamp({ ...e, status: 'cancelled' }));
      },
      watchEvents: async (calendarId, ch) => {
        this.run('watchEvents', [calendarId, ch]);
        const resourceId = `res-${calendarId}`;
        const expiration = new Date(+this.clock() + ch.ttlSeconds * 1000);
        this.channels.set(ch.id, { resourceId, expiration, stopped: false });
        return { resourceId, expiration };
      },
      stopChannel: async (id) => {
        this.run('stopChannel', [id]);
        const ch = this.channels.get(id);
        if (ch) ch.stopped = true;
      },
    };
  }
}
