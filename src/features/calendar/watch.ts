import 'server-only';
import { log } from './core';
import type { Ctx } from './sync';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { randomToken, safeEqual, sha256 } from '@/lib/token-crypto';

/** Push channels and the webhook check (WI-131). */
const WATCH_TTL_SECONDS = 7 * 86400;
const RENEW_BEFORE_MS = 24 * 3600000;
/** Push channels exist only with a public HTTPS base URL; they are renewed a day before expiry. */
export async function ensureWatch(ctx: Ctx) {
  const base = ctx.deps.config.webhookBaseUrl;
  if (!base) return;
  const now = ctx.deps.now();
  const active = await db().calendarWatchChannel.findMany({
    where: { connectionId: ctx.conn.id, stoppedAt: null },
  });
  if (active.some((c) => +c.expiration - +now > RENEW_BEFORE_MS)) return;
  const token = randomToken();
  const channelId = randomUUID();
  const created = await ctx.api.watchEvents(ctx.calendarId, {
    id: channelId,
    address: `${base.replace(/\/$/, '')}/api/calendar/webhook`,
    token,
    ttlSeconds: WATCH_TTL_SECONDS,
  });
  await db().calendarWatchChannel.create({
    data: {
      connectionId: ctx.conn.id,
      channelId,
      resourceId: created.resourceId,
      tokenHash: sha256(token),
      expiration: created.expiration,
    },
  });
  for (const old of active) {
    await ctx.api
      .stopChannel(old.channelId, old.resourceId ?? '')
      .catch(() => {});
    await db().calendarWatchChannel.update({
      where: { id: old.id },
      data: { stoppedAt: now },
    });
  }
  log('watch-renewed', { userId: ctx.user.id, replaced: active.length });
}

/**
 * Validates a Google push notification. Every check must pass; the message is only a signal to
 * run an incremental sync, never event data. Returns the owner to sync, if any.
 */
export async function verifyWebhook(
  headers: {
    channelId: string | null;
    resourceId: string | null;
    token: string | null;
    state: string | null;
  },
  now = new Date(),
) {
  if (
    !headers.channelId ||
    !headers.resourceId ||
    !headers.token ||
    !headers.state
  )
    return { status: 400 as const };
  const channel = await db().calendarWatchChannel.findUnique({
    where: { channelId: headers.channelId },
    include: { connection: true },
  });
  if (
    !channel ||
    channel.stoppedAt ||
    channel.expiration <= now ||
    channel.resourceId !== headers.resourceId ||
    !safeEqual(channel.tokenHash, sha256(headers.token)) ||
    channel.connection.status !== 'CONNECTED'
  )
    return { status: 404 as const };
  if (headers.state === 'sync') return { status: 200 as const };
  if (!['exists', 'not_exists'].includes(headers.state))
    return { status: 400 as const };
  return { status: 200 as const, userId: channel.connection.userId };
}
