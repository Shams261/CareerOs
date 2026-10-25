# WI-028: Study Nudges and Rest today

Date: 2026-10-25. Branch `feat/wi-028-study-nudges` from `main` `a080229` (R1–R3). This is Phase 1, slice 2 of the Version 2 plan (`docs/product/v2-plan.md`, sections 5 and 7).

## Outcome

Study Nudges are two optional reminders, both off by default.

- **Morning encouragement.** A first step at a chosen local time on chosen days. By default it goes out only on days with a study block.
- **Evening check-in.** It goes out only when a study block has ended, is still planned and has no session recorded. The day must also not be rested or closed, with no study session that day and nothing running.

Both arrive as one notification and as a card on Today (`#study-nudge`). The card names the block, because the screen is unlocked. The lock screen never does.

**Rules, all in `src/features/nudges/domain.ts`**

- `morningDue` sends from the chosen time for up to three hours, never late at noon.
- `eveningDue` sends from the chosen time until quiet hours begin, and at least four hours after a morning nudge.
- Neither sends during quiet hours (default 22:00–07:30) or while paused. Neither sends on a day that is not chosen, on a rest day, or while a session is running. A running session defers the evening check-in until it ends.
- Each mode sends at most once a local day: `nudgeKey` is the owner, type and day, so a cron retry never sends twice. That makes two a day at most.
- Study blocks are the categories the owner picks (default DSA and Technical, matched by name or `categoryGroup`). Cancelled blocks are excluded, and so are test-named blocks (`isTestNamed`, R1).
- Local time uses `localInstant` and `dayKey` in the owner's timezone, so 08:00 stays 08:00 across the 2026-11-01 DST change.

**Delivery**

- `processStudyNudges` runs first inside the existing notification job and per-owner lock. It writes `NotificationLog` rows of type `STUDY_MORNING` or `STUDY_EVENING` with `metadata.blockId`.
- **When Silsila is open** (`User.lastActiveAt` within five minutes), the row is `inAppOnly`, and `deliverPending` never pushes it. The shell's `PresenceBeat` posts `POST /api/presence` at most every two minutes while a page is visible.
- On the lock screen a push reads "Good morning" or "Study check-in" with one general line (`LOCK_SCREEN_TEXT`). Tapping it opens `/today#study-nudge`, and the R3 opened stamp records it.
- **Coordination.** When the evening check-in exists, the daily reminder (`DAILY_PROGRESS`) is still written but kept in the app. While the evening check-in is on, overdue reminders skip study blocks, so one passed block never produces two alerts.

**The card's actions.** Each one writes only after its own confirmation.

- **Start 20 min** opens Focus with a 20-minute target (`/focus?block=…&minutes=20`, 5–180 accepted). Begin is the confirmation.
- **Log what happened** jumps to the block's row on Today, where Log time is.
- **Move to tomorrow** previews "Moves to Mon, Oct 26 · 16:15–16:30", then Confirm moves it through the existing `saveBlock`. A move closes the check-in, and an overlap is refused with the editor's message.
- **Rest today** asks "Mark today as a rest day? Evening check-ins stop for today." Confirm sets `DailyPlan.restAt` and closes the day's nudges. Undo (`clear-rest-day`) clears it, and Today's header shows a Rest day mark meanwhile.
- **Useful? Yes / Not today / Too many** stores `NotificationLog.feedback` and closes the card. Too many answers with a link to the Study nudges settings.

**Settings.** A Study nudges row under Reminders ("Check-in from 19:30 · Mon Tue Wed Thu Fri", plus "· Paused") opens a panel. The panel has:

- Both modes with their times and the exact line they send.
- Days, "Only on days with a study block" and study categories.
- Quiet hours, which are validated so the morning time is never inside them.
- Pause this week, pause until turned back on, and resume.
- A This device section with the existing push controls and the iPhone Home Screen note.

## Copy

- **Morning lines** rotate by day. They no longer begin "Good morning." because the title already says it; the plan was updated to match:
  - "You don’t need a perfect day—just a first step. Your plan is here when you’re ready."
  - "One block is enough to begin. Your plan is ready when you are."
  - "Start small today. Your plan is here."
- **Evening lines:**
  - "I don’t see a study session recorded for today yet. Would a short session still help, or would you rather move it?"
  - "No study session is recorded yet today. A short one, a move, or rest are all fine."
- `BANNED_WORDS` (missed, failed, you didn’t, streak, don’t break) is checked against every line in tests.

## Schema

One migration, `20261025180000_study_nudges`:

- Enum values `STUDY_MORNING` and `STUDY_EVENING`.
- A `StudyNudgeSetting` table, one row per owner, with CHECK constraints for HH:MM times and the 7-bit day mask.
- `DailyPlan.restAt`, `User.lastActiveAt` and `NotificationLog.inAppOnly` (default false).

`LATEST_MIGRATION` is bumped. The export includes `studyNudges`.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/features/nudges/{domain,service,actions}.ts`, `src/features/nudges/{forms,card,presence}.tsx`, `src/app/api/presence/route.ts`, `prisma/migrations/20261025180000_study_nudges/`, `tests/nudges-domain.test.ts`, `tests/nudges-database.test.ts`, `tests/study-nudges-migration.test.ts`, `docs/screenshots/wi-028/`                                                                                                                                                                                                                            |
| Changed | `prisma/schema.prisma`, `src/server/health.ts`, `src/features/notifications/service.ts` (nudges first, `inAppOnly`, the two coordination rules), `src/features/push/{domain,service}.ts`, `src/features/undo/service.ts`, `src/app/today/page.tsx`, `src/features/today/{header,attention}.tsx`, `src/app/settings/page.tsx`, `src/app/layout.tsx`, `src/app/focus/page.tsx` and `src/features/execution/focus.tsx` (`minutes`), `src/components/feedback-outlet.tsx` (renders a result's link), `src/app/globals.css`, `src/server/export.ts`, docs |

## Differences from the plan

- **Location.** The pure rules are `morningDue` and `eveningDue` in `src/features/nudges/domain.ts`, not one `studyNudgeDue()` in the notifications domain.
- **Permission flow.** There is no separate explainer sheet. The Settings panel shows the copy, the cap and quiet hours beside the existing Enable button, which asks for permission inside the tap. Without permission or support the device stays in-app only, and the iPhone note is always shown there.
- **Log what happened** jumps to the block's row (Log time) instead of opening a prefilled form.
- **Moves that collide.** A move into an overlapping slot shows the editor's refusal instead of opening the editor.
- **Not built.** The weekly "Keep the chain going, gently." line on the morning card. It is optional in the plan.
- **Focus on open.** A notification opens `/today#study-nudge`; the card is focusable but focus is not moved to it programmatically.

## Verification

| Check                                       | Result                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prisma format, lint, typecheck, docs, build | Pass, on an export of the working tree                                                                                                                                                                                                                                                                                                                             |
| `pnpm test:ci` (disposable database)        | 52 files, 353 tests pass. Nudge domain 15, nudge database 8, migration upgrade 1                                                                                                                                                                                                                                                                                   |
| Migration                                   | Fresh `migrate deploy` clean, `migrate diff --exit-code` reports no difference, the upgrade test keeps existing rows (`inAppOnly` false) and rejects bad times and day masks, and the seed runs twice idempotently                                                                                                                                                 |
| Browser, 1440 light                         | The morning nudge was created in-app only while the page was open. The evening check-in named the passed DSA block. Move to tomorrow previewed, moved the block to the next day at the same time and closed the card. Rest today confirmed, closed the card, showed Rest day and Undo cleared it. Too many linked to Settings. Start 20 min opened Focus at 20 min |
| Browser, 390 light and dark                 | No horizontal overflow, actions in a 2×2 grid at 44 px, no console errors                                                                                                                                                                                                                                                                                          |
| Not verified                                | A real push on an iPhone Home Screen app and on Android. The lock-screen text is covered by `tests/push-privacy.test.ts` and the database test                                                                                                                                                                                                                     |

Screenshots: `docs/screenshots/wi-028/`.

## Owner steps

1. **Before merging**, apply the migration to production from your own terminal, as with R3: `pnpm db:deploy` with the Supabase URL read by `read -rs`. Health reports `schema: behind` until then.
2. **Before turning nudges on**, clean up the 16 test records `pnpm data:check` listed in production. Test-named blocks are excluded anyway.
3. Turn on one mode in Settings → Reminders → Study nudges. Enable notifications on the phone from the Home Screen app.
4. After 14 days, review the plan's measures: "Yes" answers, evening check-ins followed by a session, a move or a rest, and any "Too many" or pause.
