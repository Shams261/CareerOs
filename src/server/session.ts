import 'server-only';
import { cookies } from 'next/headers';
import { db } from './db';
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
      expiresAt: new Date(+now + SESSION_DAYS * 86400000),
      lastSeenAt: now,
    },
  });
  return token;
}

/** Valid only if unexpired, unrevoked, and still the configured owner (allowlist re-checked). */
export async function resolveSession(
  token: string | undefined,
  now = new Date(),
) {
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const session = await db().session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.user.email.toLowerCase() !== env().OWNER_EMAIL.toLowerCase()
  )
    return null;
  if (+now - +session.lastSeenAt > TOUCH_MS)
    await db().session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
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
}

export async function currentSession() {
  return resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
}
