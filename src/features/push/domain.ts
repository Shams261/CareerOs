import { z } from 'zod';

/** Where a notification click opens. Only same-origin paths; no personal data in the URL. */
export function notificationPath(type: string, dedupeKey: string) {
  const entity = dedupeKey.split(':')[2];
  switch (type) {
    case 'DSA_REVISION':
      return '/dsa';
    case 'TECHNICAL_REVIEW':
      return '/learn';
    case 'JOB_FOLLOW_UP':
      return entity && /^[\w-]+$/.test(entity) ? `/jobs/${entity}` : '/jobs';
    case 'INTERVIEW':
      return '/jobs';
    case 'WEEKLY_REVIEW':
      return '/review';
    default:
      return '/today';
  }
}
/** Encrypted by the Web Push protocol end to end; contains the reminder text only. */
export const pushPayload = (n: {
  id: string;
  type: string;
  title: string;
  dedupeKey: string;
}) =>
  JSON.stringify({
    title: 'Silsila',
    body: n.title,
    tag: n.id,
    url: notificationPath(n.type, n.dedupeKey),
  });

export type PushOutcome = 'delivered' | 'gone' | 'transient' | 'rejected';
/** 404/410 = subscription permanently gone; 429/5xx/network = retry later; other 4xx = rejected. */
export function classifyPushStatus(
  statusCode: number | undefined,
): PushOutcome {
  if (statusCode && statusCode >= 200 && statusCode < 300) return 'delivered';
  if (statusCode === 404 || statusCode === 410) return 'gone';
  if (!statusCode || statusCode === 429 || statusCode >= 500)
    return 'transient';
  return 'rejected';
}
export const MAX_PUSH_ATTEMPTS = 3;
export const PUSH_FRESH_MS = 2 * 3600000;
export const MAX_SUBSCRIPTION_FAILURES = 5;

const b64url = (min: number, max: number) =>
  z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${min},${max}}={0,2}$`));
/** Browser PushSubscription.toJSON() shape. Push services always use HTTPS endpoints. */
export const subscriptionInput = z.object({
  endpoint: z
    .url()
    .refine((v) => v.startsWith('https://'), 'Push endpoints use HTTPS')
    .pipe(z.string().max(2000)),
  keys: z.object({ p256dh: b64url(80, 100), auth: b64url(16, 30) }),
  label: z.string().trim().max(120).optional(),
});
