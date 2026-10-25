# Version 2 readiness R1–R3: test data check, lock-screen privacy, notification opened and feedback

Date: 2026-10-25. Branch `feat/r1-r3-readiness` from `main` `8f73c41` (WI-027). These are Phase 0 of the Version 2 plan (`docs/product/v2-plan.md`, sections 3 and 5). Study Nudges (WI-028) depend on all three.

## Outcome

- **R1: test data check.** `pnpm data:check` is read-only.
  - It lists records named the way test data is written, as model and id only, never the names. It covers goals, routines, today's and later blocks, roadmaps, hand-added roadmap items, problems, applications, rounds and open notes.
  - It exits 1 until they are cleaned up.
  - The rule is `isTestNamed` in `src/lib/test-data.ts`. A name counts as test data when it has a capitalised marker (TEST, DEMO, DUMMY, SAMPLE), the word UAT in any case, a bracketed marker ("(demo)", "[test]"), or nothing but a marker ("test", "Test 2").
  - **This changes the plan's rule.** The plan's simple `\b(test|uat|demo|sample|dummy)\b` caught the curriculum item "Bug squash: run the failing test first". Imported curriculum items (those with a slug) are now skipped.
  - Study Nudges and the AI will use the same helper to exclude records at runtime.
- **R2: lock-screen privacy.** A push now carries one general line for its reminder type, from `LOCK_SCREEN_TEXT` in `src/features/push/domain.ts`. Examples: "A planned block starts soon.", "An interview is coming up.", "Ready to review your day?". It never carries the reminder's own text, so no block title, company, round, note or item name reaches a lock screen. The inbox and Today keep the named text.
- **R3: opened and feedback.** `NotificationLog` gains `openedAt` and `feedback` (`NotificationFeedback`: `HELPFUL | NOT_TODAY | TOO_MANY`), in migration `20261025160000_notification_opened_feedback`.
  - Clicking a notification makes the service worker post its id to `POST /api/notifications/opened`. That endpoint is private, owner-scoped through the session, and stamps `openedAt` once.
  - The stamp runs alongside opening the app, so `openWindow` stays inside the click's activation.
  - `feedback` has no UI yet. Study Nudges ask "Useful?" from WI-028.
  - The export includes both fields.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/lib/test-data.ts`, `scripts/data-check.ts`, `src/app/api/notifications/opened/route.ts`, `prisma/migrations/20261025160000_notification_opened_feedback/`, `tests/test-data.test.ts`, `tests/push-privacy.test.ts`, `tests/notification-opened-database.test.ts`, `tests/notification-feedback-migration.test.ts`                                                                                               |
| Changed | `prisma/schema.prisma`, `src/server/health.ts` (`LATEST_MIGRATION`), `src/features/push/domain.ts`, `public/sw.js`, `src/features/notifications/service.ts` (`markNotificationOpened`), `src/server/export.ts`, `package.json` (`data:check`), `tests/push-crypto.test.ts`, `tests/production-database.test.ts`, `tests/proxy.test.ts`, docs (notifications-pwa, security, operations, CHANGELOG, CLAUDE.md, README) |

**Test expectation changes.** Two tests pinned the old push body: `tests/push-crypto.test.ts` and `tests/production-database.test.ts` (two cases). They now expect the general line. This is the intended R2 change; the encryption, delivery and dedupe checks are unchanged.

## Verification

| Check                                          | Result                                                                                                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs check, diff check | See the PR, run on an export of the working tree                                                                                                                                                            |
| `pnpm test:ci` (disposable database)           | See the PR                                                                                                                                                                                                  |
| Migration                                      | Fresh `migrate deploy`, `migrate diff --exit-code` = 0 (no drift), and an upgrade test from the previous migration: existing reminders keep null `openedAt` and `feedback`, the enum rejects unknown values |
| `pnpm data:check` on the dev database          | Lists one record (the seed application "Example Labs (demo)") and exits 1. The curriculum item "run the failing test first" is not listed                                                                   |
| Opened endpoint, dev browser                   | 204 and `openedAt` stamped. A second call leaves the first time. A bad body returns 400. Without a session it returns 401 (proxy test)                                                                      |
| Push privacy                                   | Every `NotificationType` has a general line, and a payload built from fictional names contains none of them                                                                                                 |

## Owner steps after merge

1. Take a backup first (`docs/engineering/backup-restore.md`). Then run `DATABASE_URL=<Supabase URL> pnpm db:deploy` from your own terminal to apply the migration.
2. Run `DATABASE_URL=<Supabase URL> pnpm data:check`, then clean up every listed record in the app (TEST routine, blocks, company). Run it again until it says "Clean".
3. When a reminder arrives on your phone, the lock screen should show only the general line.
