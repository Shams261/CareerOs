import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { db } from './db';
import { cacheEnabled, onForget } from './memo';
import { env } from '@/lib/env';
import { randomToken, sha256 } from '@/lib/token-crypto';
import { AuthError } from '@/features/auth/oidc';

/** Server-side owner sessions (ADR-012). The cookie holds a random token; the DB holds its hash. */
export const SESSION_COOKIE = 'careeros_session';
export const SESSION_DAYS = 30;
const TOUCH_MS = 3600000;

/**
 * The owner's User row for a verified sign-in. A fresh database gets it on first sign-in. If other
 * users already exist, a changed or mistyped OWNER_EMAIL must never start a second, empty workspace.
 */
export async function ownerAccount(email: string) {
  const existing = await db().user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (existing) return existing;
  if (await db().user.count()) throw new AuthError('owner_mismatch');
  return db().user.create({
    data: { email, name: email.split('@')[0], timezone: 'America/Toronto' },
  });
}

export async function createSession(
  userId: string,
  userAgent: string | null,
  now = new Date(),
) {
  const token = randomToken(32);
  await db().session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      userAgent: userAgent?.slice(0, 200) ?? null,
      // One clock for the row: createdAt, expiresAt and lastSeenAt (the check needs expiry > creation).
      createdAt: now,
      expiresAt: new Date(+now + SESSION_DAYS * 86400000),
      lastSeenAt: now,
    },
  });
  return token;
}

/**
 * Sessions remembered for a minute (WI-061): the middleware and the page both resolve the
 * session, and each read was two round trips to the database before any page data. Entries
 * are keyed by the token's hash; sign-out, Sign out other devices and every write (through
 * `forgetAll`) drop them, and expiry, revocation and the owner allowlist are checked on every
 * hit. Off under test, like the snapshots, so database tests stay exact.
 */
export const SESSION_CACHE_MS = 60_000;
type Resolved = Awaited<ReturnType<typeof loadSession>>;
// On globalThis: the middleware is a separate bundle in the same process, and a sign-out
// must clear the copy it reads too.
const sessions = ((
  globalThis as unknown as {
    silsilaSessions?: Map<string, { value: Resolved; until: number }>;
  }
).silsilaSessions ??= new Map());
export const forgetSessions = () => sessions.clear();
onForget(forgetSessions);
const loadSession = (tokenHash: string) =>
  db().session.findUnique({ where: { tokenHash }, include: { user: true } });

/** Valid only if unexpired, unrevoked, and still the configured owner (allowlist re-checked). */
export async function resolveSession(
  token: string | undefined,
  now = new Date(),
) {
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const tokenHash = sha256(token);
  const hit = cacheEnabled() ? sessions.get(tokenHash) : undefined;
  let session: Resolved;
  if (hit && hit.until > Date.now()) session = hit.value;
  else {
    session = await loadSession(tokenHash);
    if (cacheEnabled())
      sessions.set(tokenHash, {
        value: session,
        until: Date.now() + SESSION_CACHE_MS,
      });
  }
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.user.email.toLowerCase() !== env().OWNER_EMAIL.toLowerCase()
  )
    return null;
  if (+now - +session.lastSeenAt > TOUCH_MS) {
    await db().session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
    // The cached row now carries the new time, so the next hit does not touch it again.
    session.lastSeenAt = now;
  }
  return session;
}

export async function revokeSession(
  token: string | undefined,
  now = new Date(),
) {
  if (!token) return;
  await db().session.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: now },
  });
  forgetSessions();
}

/** Resolved once per request: the layout, the page and the shell panels all share it. */
export const currentSession = cache(async () =>
  resolveSession((await cookies()).get(SESSION_COOKIE)?.value),
);

/** The owner's live sessions, newest activity first, marking the one making this request (WI-057). */
export async function activeSessions(
  userId: string,
  currentId: string | null,
  now = new Date(),
) {
  const rows = await db().session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true },
  });
  return rows.map((r) => ({ ...r, current: r.id === currentId }));
}

/** Sign out other devices: revokes every live session of the owner except this one. */
export async function revokeOtherSessions(
  userId: string,
  keepId: string,
  now = new Date(),
) {
  const { count } = await db().session.updateMany({
    where: { userId, revokedAt: null, id: { not: keepId } },
    data: { revokedAt: now },
  });
  forgetSessions();
  return count;
}
