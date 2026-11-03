import { z } from 'zod';

/** Where a notification click opens. Only same-origin paths; no personal data in the URL. */
export function notificationPath(type: string, dedupeKey: string) {
  const entity = dedupeKey.split(':')[2];
  switch (type) {
    case 'DSA_REVISION':
      return '/dsa';
    case 'TECHNICAL_REVIEW':
      return '/today';
    case 'JOB_FOLLOW_UP':
      return entity && /^[\w-]+$/.test(entity) ? `/jobs/${entity}` : '/jobs';
    case 'INTERVIEW':
      return '/jobs';
    case 'WEEKLY_REVIEW':
      return '/review';
    case 'STUDY_MORNING':
    case 'STUDY_MIDDAY':
    case 'STUDY_EVENING':
    case 'STUDY_BLOCK':
      return '/today#study-nudge';
    default:
      return '/today';
  }
}
/**
 * What a push may say on a lock screen (R2, Version 2 plan): one general line per reminder
 * type. A block title, company, round, note or item name never leaves in a push; the named
 * reminder stays in the inbox and on Today, which only show once the device is unlocked.
 */
export const LOCK_SCREEN_TEXT: Record<string, string> = {
  UPCOMING_BLOCK: 'A planned block starts soon.',
  OVERDUE_TASK: 'A planned block has no session recorded yet.',
  DAILY_PROGRESS: 'Ready to review your day?',
  MISSED_CHECK_IN: 'Your daily check-in is waiting.',
  JOB_FOLLOW_UP: 'A job follow-up is due.',
  INTERVIEW: 'An interview is coming up.',
  TECHNICAL_REVIEW: 'Roadmap items are due for revision today.',
  DSA_REVISION: 'Practice problems are due for revision today.',
  WEEKLY_REVIEW: 'Your weekly review is ready.',
  STUDY_MORNING:
    'You don’t need a perfect day—just a first step. Your plan is here when you’re ready.',
  STUDY_EVENING:
    'I don’t see a study session recorded for today yet. Would a short session still help, or would you rather move it?',
  STUDY_BLOCK: 'A study block has started. Open Silsila to begin or move it.',
  // WI-101: Rumi's afternoon line; the line itself stays in the app.
  STUDY_MIDDAY: 'Rumi has a line for the afternoon.',
};
export const lockScreenText = (type: string) =>
  LOCK_SCREEN_TEXT[type] ?? 'You have a Silsila reminder.';

/**
 * WI-112: a picture of Rumi for the reminder's type, shown large where the browser supports
 * it (Chrome and Edge on Android and Windows; Safari and the iPhone show the text only). The
 * pictures are fixed art in `public/notify/`, the same for everyone, so they carry nothing
 * personal; a type without one sends no image.
 */
export const PUSH_IMAGE: Record<string, string> = {
  STUDY_MORNING: 'morning-desk',
  STUDY_MIDDAY: 'planning-the-week',
  STUDY_EVENING: 'one-more-chapter',
  STUDY_BLOCK: 'calm-focus',
  UPCOMING_BLOCK: 'rainy-focus',
  DAILY_PROGRESS: 'night-recap',
  INTERVIEW: 'interview-day',
  TECHNICAL_REVIEW: 'revision-ladder',
  DSA_REVISION: 'revision-ladder',
  WEEKLY_REVIEW: 'sunday-review',
};
/** The only image paths a push may name; the service worker checks the same shape. */
export const PUSH_IMAGE_PATH = /^\/notify\/[a-z-]+\.jpg$/;
export const pushImage = (type: string) =>
  PUSH_IMAGE[type] ? `/notify/${PUSH_IMAGE[type]}.jpg` : undefined;

/**
 * Encrypted by the Web Push protocol end to end. Carries only the general line for the
 * reminder's type, the notification id (tag), a same-origin path and, since WI-112, the
 * type's fixed picture; `title` is unused here
 * on purpose so the reminder's named text can never reach a lock screen.
 */
export const pushPayload = (n: {
  id: string;
  type: string;
  title: string;
  dedupeKey: string;
}) =>
  JSON.stringify({
    title: 'Silsila',
    body: lockScreenText(n.type),
    tag: n.id,
    url: notificationPath(n.type, n.dedupeKey),
    image: pushImage(n.type),
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
/**
 * The browsers' push services (WI-145): Chrome, Edge's Chromium and Android (FCM), Firefox
 * (Mozilla), Safari and the Home Screen app (Apple), and Windows' own. The server posts to the
 * endpoint, so any other host is refused rather than becoming a place the server can be sent.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];
const pushHostAllowed = (endpoint: string) => {
  if (!URL.canParse(endpoint)) return false;
  const host = new URL(endpoint).hostname;
  return PUSH_HOSTS.some((h) => h.test(host));
};
/** Browser PushSubscription.toJSON() shape. Push services always use HTTPS endpoints. */
export const subscriptionInput = z.object({
  endpoint: z
    .url()
    .refine((v) => v.startsWith('https://'), 'Push endpoints use HTTPS')
    .refine(
      pushHostAllowed,
      "This browser's push service is not one Silsila knows",
    )
    .pipe(z.string().max(2000)),
  keys: z.object({ p256dh: b64url(80, 100), auth: b64url(16, 30) }),
  label: z.string().trim().max(120).optional(),
});
