import 'server-only';
import { key, log, getConnection, type CalendarDeps } from './core';
import { CalendarError } from './errors';
import { createHash } from 'node:crypto';
import { db } from '@/server/db';
import type { CalendarConnection } from '@/generated/prisma/client';
import { type ScheduleUser } from '@/server/lock';
import {
  decryptSecret,
  encryptSecret,
  randomToken,
  safeEqual,
} from '@/lib/token-crypto';
import { CALENDAR_SCOPE, GoogleApiError, idTokenEmail } from './google';
import { CALENDAR_NAME } from './domain';

/** Google Calendar authorization: PKCE, the callback and access tokens (WI-131). */
// ---------------------------------------------------------------- OAuth

const OAUTH_TTL_MS = 10 * 60000;
/** Starts Authorization Code + PKCE. State, verifier and owner travel in an encrypted cookie. */
export function beginOAuth(user: ScheduleUser, deps: CalendarDeps) {
  const state = randomToken(),
    verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const cookie = encryptSecret(
    JSON.stringify({
      state,
      verifier,
      userId: user.id,
      exp: +deps.now() + OAUTH_TTL_MS,
    }),
    key(deps),
  );
  return { url: deps.oauth.authorizationUrl(state, challenge), cookie };
}

export async function completeOAuth(
  user: ScheduleUser,
  input: {
    code?: string | null;
    state?: string | null;
    error?: string | null;
    cookie?: string;
  },
  deps: CalendarDeps,
) {
  if (input.error) throw new CalendarError('access_denied');
  let saved: { state: string; verifier: string; userId: string; exp: number };
  try {
    saved = JSON.parse(decryptSecret(input.cookie ?? '', key(deps)));
  } catch {
    throw new CalendarError('state_mismatch');
  }
  if (
    !input.state ||
    !safeEqual(saved.state, input.state) ||
    saved.userId !== user.id
  )
    throw new CalendarError('state_mismatch');
  if (+deps.now() > saved.exp) throw new CalendarError('state_expired');
  if (!input.code) throw new CalendarError('exchange_failed');
  let tokens;
  try {
    tokens = await deps.oauth.exchangeCode(input.code, saved.verifier);
  } catch {
    throw new CalendarError('exchange_failed');
  }
  if (!tokens.scope?.split(' ').includes(CALENDAR_SCOPE)) {
    await deps.oauth.revoke(tokens.accessToken).catch(() => {});
    throw new CalendarError('scope_denied');
  }
  if (!tokens.refreshToken) throw new CalendarError('missing_refresh_token');
  const api = deps.calendar(async () => tokens.accessToken);
  const existing = await getConnection(user.id);
  // Reuse the calendar Silsila created earlier; otherwise create the dedicated one.
  let calendar = existing?.calendarId
    ? await api.getCalendar(existing.calendarId)
    : null;
  if (!calendar)
    calendar = await api.createCalendar(CALENDAR_NAME, user.timezone);
  const now = deps.now();
  const data = {
    status: 'CONNECTED' as const,
    encryptedRefreshToken: encryptSecret(tokens.refreshToken, key(deps)),
    scope: tokens.scope,
    accountEmail: idTokenEmail(tokens.idToken),
    calendarId: calendar.id,
    calendarName: calendar.summary,
    // A reconnect always reconciles from a full list before trusting incremental tokens.
    syncToken: null,
    syncLeaseUntil: null,
    lastSyncError: null,
    connectedAt: now,
    disconnectedAt: null,
  };
  const connection = await db().calendarConnection.upsert({
    where: { userId: user.id },
    create: { ...data, userId: user.id },
    update: data,
  });
  log('connected', {
    userId: user.id,
    reusedCalendar: calendar.id === existing?.calendarId,
  });
  return connection;
}

export function tokenSource(conn: CalendarConnection, deps: CalendarDeps) {
  let cached: string | undefined;
  return async () => {
    if (cached) return cached;
    if (!conn.encryptedRefreshToken) throw new CalendarError('reauth_required');
    let refresh: string;
    try {
      refresh = decryptSecret(conn.encryptedRefreshToken, key(deps));
    } catch {
      // Wrong or rotated key: fail closed and ask for a reconnect.
      throw new CalendarError('reauth_required');
    }
    try {
      cached = (await deps.oauth.refresh(refresh)).accessToken;
    } catch (error) {
      if (error instanceof GoogleApiError && error.kind === 'auth')
        throw new CalendarError('reauth_required');
      throw error;
    }
    return cached;
  };
}
