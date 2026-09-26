import 'server-only';
import webpush from 'web-push';
import { db } from '@/server/db';
import { pushConfig, type PushConfig } from '@/lib/env';
import type { ScheduleUser } from '@/features/schedule/service';
import {
  classifyPushStatus,
  MAX_PUSH_ATTEMPTS,
  MAX_SUBSCRIPTION_FAILURES,
  PUSH_FRESH_MS,
  pushPayload,
  subscriptionInput,
} from './domain';

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
/** Sends one encrypted Web Push message; resolves with the push service's status code. */
export type PushSender = (
  target: PushTarget,
  payload: string,
  cfg: PushConfig,
) => Promise<number>;
/** web-push options shared by delivery and the encryption tests. */
export const pushRequestOptions = (cfg: PushConfig) => ({
  vapidDetails: {
    subject: cfg.subject,
    publicKey: cfg.publicKey,
    privateKey: cfg.privateKey,
  },
  TTL: 12 * 3600,
  urgency: 'normal' as const,
  timeout: 10000,
});
export const webPushSender: PushSender = async (t, payload, cfg) => {
  try {
    const r = await webpush.sendNotification(
      { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
      payload,
      pushRequestOptions(cfg),
    );
    return r.statusCode;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? 0;
  }
};

export async function saveSubscription(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const s = subscriptionInput.parse(raw);
  // An endpoint belongs to one browser; re-subscribing re-activates it for this owner.
  return db().pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    create: {
      userId: user.id,
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      label: s.label ?? null,
    },
    update: {
      userId: user.id,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      label: s.label ?? null,
      revokedAt: null,
      failureCount: 0,
      createdAt: now,
    },
  });
}
export async function removeSubscription(
  user: ScheduleUser,
  endpoint: string,
  now = new Date(),
) {
  await db().pushSubscription.updateMany({
    where: { userId: user.id, endpoint, revokedAt: null },
    data: { revokedAt: now },
  });
}
export const activeDevices = (userId: string) =>
  db().pushSubscription.count({ where: { userId, revokedAt: null } });
export async function isDeviceActive(userId: string, endpoint: string) {
  return !!(await db().pushSubscription.findFirst({
    where: { userId, endpoint, revokedAt: null },
  }));
}

async function sendTo(
  sub: { id: string } & PushTarget & { failureCount: number },
  payload: string,
  cfg: PushConfig,
  sender: PushSender,
  now: Date,
) {
  const outcome = classifyPushStatus(await sender(sub, payload, cfg));
  if (outcome === 'delivered')
    await db().pushSubscription.update({
      where: { id: sub.id },
      data: { lastSuccessAt: now, failureCount: 0 },
    });
  else {
    const failures = sub.failureCount + 1;
    await db().pushSubscription.update({
      where: { id: sub.id },
      data: {
        lastFailureAt: now,
        failureCount: failures,
        // Gone subscriptions stop at once; repeated rejections stop after a few attempts.
        ...(outcome === 'gone' || failures >= MAX_SUBSCRIPTION_FAILURES
          ? { revokedAt: now }
          : {}),
      },
    });
  }
  return outcome;
}

/**
 * Delivery channel for NotificationLog (the durable source). Fresh, unread, unsent reminders go
 * to every active device; failures never remove the inbox record.
 */
export async function deliverPending(
  now = new Date(),
  sender: PushSender = webPushSender,
  cfg = pushConfig(),
) {
  const result = { notifications: 0, delivered: 0, failed: 0, revoked: 0 };
  if (!cfg) return result;
  const pending = await db().notificationLog.findMany({
    where: {
      sentAt: null,
      readAt: null,
      pushAttempts: { lt: MAX_PUSH_ATTEMPTS },
      scheduledFor: { lte: now, gte: new Date(+now - PUSH_FRESH_MS) },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 100,
  });
  for (const n of pending) {
    const subs = await db().pushSubscription.findMany({
      where: { userId: n.userId, revokedAt: null },
    });
    if (!subs.length) continue;
    result.notifications++;
    let delivered = false;
    for (const sub of subs) {
      const outcome = await sendTo(sub, pushPayload(n), cfg, sender, now);
      if (outcome === 'delivered') delivered = true;
      else {
        result.failed++;
        if (outcome === 'gone') result.revoked++;
      }
    }
    if (delivered) result.delivered++;
    await db().notificationLog.update({
      where: { id: n.id },
      data: delivered
        ? { sentAt: now, pushAttempts: { increment: 1 } }
        : { pushAttempts: { increment: 1 } },
    });
  }
  return result;
}

/** Sends a test directly to one of the owner's devices (no inbox record). */
export async function sendTest(
  user: ScheduleUser,
  endpoint: string,
  sender: PushSender = webPushSender,
  now = new Date(),
) {
  const cfg = pushConfig();
  if (!cfg) throw new Error('Web Push is not configured on this server.');
  const sub = await db().pushSubscription.findFirst({
    where: { userId: user.id, endpoint, revokedAt: null },
  });
  if (!sub) throw new Error('This device is not enabled for notifications.');
  const outcome = await sendTo(
    sub,
    JSON.stringify({
      title: 'Silsila',
      body: 'Test notification — this device will receive reminders.',
      tag: 'test',
      url: '/settings',
    }),
    cfg,
    sender,
    now,
  );
  if (outcome !== 'delivered')
    throw new Error(
      outcome === 'gone'
        ? 'This device subscription expired. Enable notifications again.'
        : 'The push service did not accept the test. Try again later.',
    );
}
