# Notifications, Web Push and the installable app

## How a reminder travels

1. The scheduler calls `POST /api/notifications/process` every minute.
2. `processNotifications` evaluates the owner's enabled preferences (daily progress, check-in, upcoming/overdue blocks, DSA and technical reviews, job follow-ups, interviews, weekly review) and inserts `NotificationLog` rows. A unique occurrence key makes retries and overlapping runs harmless. **The inbox on Today is always the source of truth.**
3. In the same request, `deliverPending` sends each new, unread, unsent reminder to every active `PushSubscription` of the owner, as an encrypted Web Push message (VAPID, RFC 8291 `aes128gcm`, TTL 12 hours, urgency normal).
4. The browser's push service wakes the service worker (`public/sw.js`), which shows the notification. Clicking it focuses an open CareerOS window or opens one at the reminder's page (`/dsa`, `/learn`, `/jobs/<id>`, `/review` or `/today`). Only same-origin paths are accepted; anything else opens `/today`.

The daily progress reminder therefore reaches a closed app: cron creates it at the preferred local time (default 21:30) when the day has not been reviewed, and push delivers it.

## Delivery rules

| Situation                                               | Behaviour                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Push service accepts (2xx)                              | `sentAt` is set; the reminder is never pushed again (delivered to at least one device). The inbox row stays unread. |
| 404 / 410 (subscription gone)                           | That device is revoked immediately.                                                                                 |
| 429, 5xx, timeout, network error                        | Retried on the next minute's run, at most **3 attempts** per reminder.                                              |
| Other 4xx (bad VAPID key, payload rejected)             | Counted as a failure; not retried more than 3 times.                                                                |
| A device fails 5 times in a row                         | It is revoked; the owner re-enables it from Settings.                                                               |
| Reminder older than 2 hours, or already read in the app | Not pushed (no late or redundant alerts).                                                                           |
| No enabled device                                       | Nothing is sent and no attempt is counted.                                                                          |
| Push not configured (no VAPID keys)                     | Inbox only; Settings says so.                                                                                       |

Upgrading to WI-008 marks existing reminders as already attempted, so enabling push never replays a backlog. Payloads contain only `CareerOS`, one reminder line, a tag and a path; never notes, contacts or reflections.

## Enabling a device

Settings → Notifications → **Enable notifications**. The permission prompt appears only after that click. The device is stored server-side (endpoint and keys, owner-scoped). **Send test notification** sends to this device only. **Disable this device** removes it on the server and unsubscribes the browser. A device that has never opted in makes no push API calls on page load. Settings lists how many devices are enabled.

## Platform support (honest)

| Platform                                     | Closed-app push                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Chrome, Edge, Firefox on Windows/macOS/Linux | Yes, while the browser process is running (it may run in the background).                                           |
| Chrome, Firefox, Samsung Internet on Android | Yes. Battery optimisation can delay delivery.                                                                       |
| Safari 16+ on macOS 13+                      | Yes, delivered by the system even when Safari is closed.                                                            |
| iPhone / iPad (iOS/iPadOS 16.4+)             | **Only after Share → Add to Home Screen, opened from the Home Screen icon.** Not in Safari tabs or in-app browsers. |
| Private/incognito windows                    | Usually unavailable or discarded when the window closes.                                                            |

Push is best-effort everywhere: focus modes, Do Not Disturb, low-power modes and the push services themselves can delay or drop alerts. Nothing guarantees delivery at an exact minute. Because the inbox is authoritative, a missed push never loses a reminder.

**Verification status.** Automated tests prove the server side: encryption and VAPID signatures (a test decrypts the real `web-push` output as a browser would), delivery and retry rules against PostgreSQL, dead-device clean-up, the closed-app daily reminder, and the service worker's push/click handlers. Automated browsers cannot hold real push subscriptions (Chromium reports the permission as blocked, Playwright's Firefox and WebKit builds have no push service), so **delivery to a real phone or desktop has not been verified** and must be checked manually after deployment (see [onboarding](../product/onboarding.md)).

## Installable app (PWA)

`/manifest.webmanifest` declares CareerOS as a standalone app (start URL `/today`, theme `#244e3b`) with 192/512 px and maskable icons; `apple-touch-icon.png` covers iOS. Install from the browser menu (desktop Chrome/Edge "Install", Android "Add to Home screen", iOS Share → Add to Home Screen).

There is **no offline mode**. The service worker handles push and notification clicks only and deliberately caches nothing: every page is private and must be fresh. Opening the app offline shows the browser's offline page.

## Operations

- Generate VAPID keys once (`pnpm exec web-push generate-vapid-keys`) and keep them stable. Rotating them invalidates every subscription.
- Settings → System status shows the notification job's last success. Server logs show `[notifications] processed {candidates, notifications, delivered, failed, revoked}` per run.
- A device that stops receiving: open Settings on it, **Disable this device**, then **Enable notifications** again.
