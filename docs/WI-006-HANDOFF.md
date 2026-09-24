# WI-006 — Google Calendar integration handoff

Branch `feat/wi-006-google-calendar`, stacked on `fix/pre-calendar-time-integrity` (WI-005.1). Merge WI-005.1 first, then rebase this branch onto `main`. No WI-007 work is included.

## What exists

- Dated TimeBlocks sync to a dedicated **CareerOS** Google calendar.
- Google edits (move, rename, delete) come back as dated overrides; routines are never touched.
- Incremental sync with 410 recovery, idempotent creates, If-Match pushes and durable conflicts with a two-choice resolution UI.
- Optional validated push channels, a cron endpoint, Sync now, sync categories, reconnect/disconnect, a Today attention notice, and interviews on the schedule as linked blocks.
- Full design in README "Google Calendar model" and ADR-010.

## Scopes

| Scope                                                  | Why                                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `https://www.googleapis.com/auth/calendar.app.created` | Create the CareerOS calendar; list, insert, patch, delete and watch events on calendars the app created. No other calendars. |
| `openid`, `email`                                      | Display which Google account is connected. Not used for authorization.                                                       |

Checked against Google's documentation for `calendars.insert`, `events.list` and `events.watch`, all of which accept `calendar.app.created`. Reading other calendars for conflict hints would need broader or free/busy scopes, so it is deferred.

## Credential storage

- AES-256-GCM via Node `crypto`, with a random 96-bit IV and an auth tag, in a `v1:iv:tag:ciphertext` envelope with the version as associated data.
- The key comes from `CALENDAR_TOKEN_ENCRYPTION_KEY` (32 bytes, base64). Its format is checked whenever Google Calendar is configured.
- Only refresh tokens are stored; access tokens are fetched per run.
- Decryption failure (wrong or rotated key) is reported as `reauth_required`. Rotation means reconnecting.
- The OAuth state cookie is also AES-GCM-encrypted, httpOnly, `SameSite=Lax`, 10-minute TTL, scoped to the callback path.

## Schema (migration `20260926090000_google_calendar`, additive)

- **New models:** `CalendarConnection` (one per owner: encrypted token, scope, calendar, status, excluded categories, sync token, lease, sync timestamps, sanitized last error and summary), `CalendarWatchChannel` (channel ID, resource ID, token hash, expiry, stopped) and `CalendarSyncConflict` (title/start/end snapshots, `OPEN`/`RESOLVED_LOCAL`/`RESOLVED_REMOTE`).
- **`TimeBlock` reuses** `externalCalendarEventId`, `externalCalendarId` and `calendarSyncedAt`.
- **`TimeBlock` adds** `calendarEtag`, `calendarSyncedHash`, `calendarSyncStatus`, `calendarSyncError`, `calendarSyncAttempts`, `calendarRetryAt` and a unique optional `interviewRoundId`.
- There is no outbox table: "pending" is derived from fingerprints, and per-block retry fields give retry-safe state.
- Existing rows start `NOT_SYNCED`. The seed creates no connections or event IDs.

## Behaviour summary

- **Mapping:**
  - one event per block, with a client-chosen `careeros…` ID
  - private properties `careerosManaged`, `careerosTimeBlockId` and `careerosSchemaVersion`
  - an event body of title, UTC instants with the owner's zone, and "Managed by CareerOS / Category"
- **Outbound:**
  - the local commit comes first, then a best-effort `after()` sync, then cron or Sync now
  - PATCH with If-Match; cancelled or excluded blocks are deleted remotely
  - completed and skipped blocks are left alone
  - failures set `ERROR` with a capped retry and never roll back local data
- **Inbound:**
  - `syncToken` pages with `showDeleted` and no filters; events without CareerOS properties are ignored
  - a move or rename becomes an override (`isOverride`, plan moved, `routineKey`/`occurrenceDate` kept)
  - a delete cancels a planned block or detaches a completed/skipped one
  - all-day or untitled edits are restored; running sessions produce a conflict
- **Full sync:** list everything first (adopting lost mappings and deleting duplicate copies), then push. The token is saved only after the last page and all writes.
- **410:** drop the token, then run a full sync that rebuilds the baseline.
- **Idempotency:**
  - the event ID is saved before insert, so a retry that gets 409 re-fetches and adopts, verified by private property
  - an incremental pull also adopts events whose create response was lost
  - a lease row serialises runs
- **Conflicts:** a three-way fingerprint comparison. Both sides changed → an `OPEN` conflict; the block is frozen until the owner picks Keep CareerOS or Use Google, which writes the other side.
- **Push:** only with `GOOGLE_CALENDAR_WEBHOOK_BASE_URL` (HTTPS).
  - channels use a random UUID ID and a 32-byte token stored as SHA-256, with a 7-day TTL, replaced within a day of expiry
  - the webhook checks ID, resource, token, expiry and connection, ignores `sync`, and triggers a lease-guarded incremental sync after responding
  - locally, the panel says push is unavailable
- **Disconnect:** stop channels, revoke, forget the token and sync token, and keep calendar and events. The optional removal requires typing the calendar name and deletes only the stored CareerOS calendar, then clears mappings.
- **Interviews:** "Add interview to schedule" creates one `INTERVIEW` block linked to the round. A round reschedule, a CareerOS block edit or a Google move keeps both in step and logs a timeline entry.
- **Timezones:** instants go out as UTC ISO strings and come back parsed with their offsets. Tests cover Toronto's fall-back hour and spring-forward, and `DATE` labels are never used as instants.

## Validation (2026-09-24)

| Check                                              | Result                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| prisma format/generate, clean deploy, drift        | Passed; `migrate diff --exit-code` = 0                                                                     |
| Upgrade WI-005.1 → WI-006                          | Passed (fixture test)                                                                                      |
| Seed twice                                         | 23 domain tables unchanged; no calendar rows                                                               |
| lint / typecheck / build / docs:check / diff-check | Passed                                                                                                     |
| `pnpm test:ci`                                     | 160 passed in 17 files (130 prior + 30 WI-006)                                                             |
| Browser (fake Google, 1440px + 390px)              | Calendar suite plus jobs, learning, DSA and schedule regressions all passed; no console errors or overflow |
| Secret scan                                        | No token or key values in server logs; only intentional fake values in tests; `.env` ignored               |

Browser acceptance found two confirmations that were lost when the panel re-rendered: resolving a conflict, and disconnecting. Both now redirect to a notice at the top of the panel.

## Known limitations

- There is no conflict reading from other calendars, and no recurrence import.
- Changes outside the 30/90-day window are not pushed. Events already published stay as they are.
- A key rotation requires reconnecting; there is no dual-key decrypt.
- The webhook's `after()` sync runs inside the web process. Very large calendars would need a real queue (not needed at single-owner scale).
- Values Google cannot represent in a TimeBlock (all-day, untitled) are reverted to the CareerOS version rather than raised as conflicts.
- No real Google account was used. Real-account behaviour must be confirmed manually (below).

## Manual real-account checklist (run yourself)

1. In Google Cloud, create a project, enable the Google Calendar API, and create an OAuth _Web application_ client with the redirect URI `http://localhost:3000/api/calendar/oauth/callback` (or your HTTPS host). Add yourself as a test user on the consent screen.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` and `CALENDAR_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) in `.env`. Use a disposable database or a verified backup.
3. `pnpm dev`, open Calendar, then **Connect Google Calendar**. The consent screen should list only "make secondary calendars…" and your email.
4. Confirm a **CareerOS** calendar appears in Google Calendar (web and phone).
5. Add a one-off test block for tomorrow on Today.
6. Press **Sync now** and confirm the event appears.
7. In Google, move the event 15 minutes later.
8. Press **Sync now**.
9. Confirm only that dated block moved; the routine on Calendar is unchanged.
10. Edit the block in CareerOS (time or title), then Sync now.
11. Confirm Google shows the change.
12. Delete the event in Google, then Sync now.
13. Confirm the CareerOS block is Cancelled and still listed.
14. In your Google account's third-party access settings, remove CareerOS, then Sync now. Confirm _Reconnect required_. Reconnect and confirm the same calendar is reused.
15. Delete the test block. Optionally use Disconnect with "Also delete" (type `CareerOS`) to remove the calendar.

## Before WI-007

- Merge order: WI-005.1, then WI-006. Follow the WI-005.1 personal-database procedure **before** connecting Google on the personal database.
- Run the manual checklist, set the scheduler for `/api/calendar/sync`, and decide on the push deployment (HTTPS host).
- Consider a Google OAuth app verification plan if more than test users will connect.

## Suggested commits

1. `feat(calendar): add Google connection, encrypted tokens and sync schema`: migration, schema, crypto, env, Google client, domain and their tests.
2. `feat(calendar): add two-way sync engine, conflicts and push channels`: service, routes, proxy, background sync, interview linkage, sync tests and the fake Google.
3. `feat(calendar): add calendar connection panel and Today notice`: panel, actions, pages.
4. `docs: document Google Calendar model, security and operations`.
