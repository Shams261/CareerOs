/**
 * Local HTTP stand-in for Google OAuth + Calendar v3, backed by FakeGoogle. For browser
 * acceptance only; the app accepts these endpoint overrides only for loopback URLs.
 *
 *   pnpm exec tsx tests/support/fake-google-server.ts   (PORT, default 4455)
 *
 * Control endpoints simulate a person using Google Calendar: GET /__state, POST /__edit,
 * POST /__delete, POST /__revoke.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { FakeGoogle } from './fake-google';
import { GoogleApiError } from '../../src/features/calendar/google';

const fake = new FakeGoogle();
fake.pageSize = 50;
const api = fake.api();
const oauth = fake.oauth();
const port = Number(process.env.PORT ?? 4455);

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
function send(res: ServerResponse, status: number, data?: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(data === undefined ? '' : JSON.stringify(data));
}
const fail = (res: ServerResponse, e: unknown) =>
  e instanceof GoogleApiError
    ? send(
        res,
        e.status,
        e.reason === 'invalid_grant'
          ? { error: 'invalid_grant' }
          : { error: { errors: [{ reason: e.reason }] } },
      )
    : send(res, 500, { error: { errors: [{ reason: 'backendError' }] } });

createServer(async (req, res) => {
  const url = new URL(req.url!, `http://127.0.0.1:${port}`);
  const p = url.pathname;
  try {
    if (p === '/o/oauth2/v2/auth') {
      const back = new URL(url.searchParams.get('redirect_uri')!);
      back.searchParams.set('code', 'fake-code');
      back.searchParams.set('state', url.searchParams.get('state')!);
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (p === '/token') {
      const form = new URLSearchParams(await body(req));
      const t =
        form.get('grant_type') === 'authorization_code'
          ? await oauth.exchangeCode(
              form.get('code')!,
              form.get('code_verifier')!,
            )
          : await oauth.refresh(form.get('refresh_token')!);
      return send(res, 200, {
        access_token: t.accessToken,
        refresh_token: t.refreshToken,
        scope: t.scope,
        id_token: t.idToken,
      });
    }
    if (p === '/revoke') return send(res, 200, {});
    if (p === '/__state')
      return send(
        res,
        200,
        [...fake.calendars.values()].map((c) => ({
          id: c.id,
          summary: c.summary,
          events: fake.events(c.id),
        })),
      );
    if (p === '/__edit' || p === '/__delete') {
      const { calendarId, eventId, patch } = JSON.parse(await body(req));
      if (p === '/__edit') fake.userEdit(calendarId, eventId, patch);
      else fake.userDelete(calendarId, eventId);
      return send(res, 200, {});
    }
    if (p === '/__revoke') {
      fake.refreshRevoked = JSON.parse(await body(req)).on;
      return send(res, 200, {});
    }
    const m = p.match(
      /^\/calendar\/v3\/calendars(?:\/([^/]+))?(?:\/events(?:\/([^/]+))?)?$/,
    );
    if (p === '/calendar/v3/channels/stop') {
      const { id, resourceId } = JSON.parse(await body(req));
      await api.stopChannel(id, resourceId);
      return send(res, 204);
    }
    if (m) {
      const cal = m[1] && decodeURIComponent(m[1]);
      const ev = m[2] && decodeURIComponent(m[2]);
      const isEvents = p.includes('/events');
      if (!cal && req.method === 'POST') {
        const { summary, timeZone } = JSON.parse(await body(req));
        return send(res, 200, await api.createCalendar(summary, timeZone));
      }
      if (!isEvents) {
        if (req.method === 'GET') {
          const c = await api.getCalendar(cal!);
          return c
            ? send(res, 200, c)
            : send(res, 404, { error: { errors: [{ reason: 'notFound' }] } });
        }
        if (req.method === 'DELETE')
          return (await api.deleteCalendar(cal!), send(res, 204));
      }
      const etag = req.headers['if-match'] as string | undefined;
      if (ev === 'watch') {
        const w = JSON.parse(await body(req));
        const r = await api.watchEvents(cal!, {
          id: w.id,
          address: w.address,
          token: w.token,
          ttlSeconds: Number(w.params?.ttl ?? 604800),
        });
        return send(res, 200, {
          resourceId: r.resourceId,
          expiration: String(+r.expiration),
        });
      }
      if (!ev && req.method === 'GET')
        return send(
          res,
          200,
          await api.listEvents(cal!, {
            pageToken: url.searchParams.get('pageToken') ?? undefined,
            syncToken: url.searchParams.get('syncToken') ?? undefined,
          }),
        );
      if (!ev && req.method === 'POST')
        return send(
          res,
          200,
          await api.insertEvent(cal!, JSON.parse(await body(req))),
        );
      if (ev && req.method === 'GET') {
        const e = await api.getEvent(cal!, ev);
        return e
          ? send(res, 200, e)
          : send(res, 404, { error: { errors: [{ reason: 'notFound' }] } });
      }
      if (ev && req.method === 'PATCH')
        return send(
          res,
          200,
          await api.patchEvent(cal!, ev, JSON.parse(await body(req)), etag),
        );
      if (ev && req.method === 'DELETE')
        return (await api.deleteEvent(cal!, ev, etag), send(res, 204));
    }
    send(res, 404, { error: { errors: [{ reason: 'notFound' }] } });
  } catch (e) {
    fail(res, e);
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`fake google on http://127.0.0.1:${port}`),
);
