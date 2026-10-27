# WI-039: Coach notifications (no AI)

Date: 2026-10-26. Branch `feat/wi-039-coach` from `main` `e6bf29d` (WI-038). This is the second item of the Rumi plan (`docs/product/rumi-plan.md`). It extends Study Nudges (WI-028). No AI is involved; every line is a fixed template filled with the owner's own facts. One migration.

## Outcome

Settings → Reminders → Study nudges now has three parts, all off by default:

| Part                                            | When                                                                                                                                                   | What the card on Today says                                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Morning** (existing, now with facts)          | The chosen time, up to three hours late                                                                                                                | "Today: 18:00–19:30 DSA practice · 20:00–21:00 System design. Yesterday 18:00–21:00 Coding had no session recorded." plus the rotating morning line                                                    |
| **When a study block starts** (new)             | The chosen minutes after a study block's start (5, 10, 15, 20 or 30; 15 by default), while the block is still running, with no session and no decision | "18:00–19:30 DSA practice started 15 minutes ago and no session has begun yet. 75 minutes of it are left." Buttons: **Start 20 min** (Focus), **Move to tomorrow** and **Let go**, each with a confirm |
| **Evening check-in** (existing, now with facts) | The same triggers as before: a study block passed with no study session all day                                                                        | The evening line, then "Left today: 18:00–19:30 DSA practice. Tomorrow starts with 07:30–08:15 DSA warm-up."                                                                                           |

**Rules for the block-start nudge** (`blockStartDue` in `src/features/nudges/domain.ts`):

- One nudge per block, and at most one a day (`BLOCK_NUDGES_PER_DAY`).
- None in quiet hours, while paused, on a rest day, on a closed day, or while a session runs.
- None when the block is recorded, done or skipped, or has ended.
- While it is on, the older **upcoming** and **overdue** reminders skip study blocks, so a block never produces two notifications.

**Let go** (`letGoAction`) skips the block with the reason "Let go", through the existing writer. It closes the day's nudges and offers Undo (`block-reset`).

**Privacy:**

- The lock screen gets only "A study block has started. Open Silsila to begin or move it." (`LOCK_SCREEN_TEXT.STUDY_BLOCK`). A tap opens `/today#study-nudge`.
- Block titles appear only on Today, as before.
- Silsila open on a page means the nudge stays in the app (`inAppOnly`).
- Test-named blocks never count.

**Copy:** firm and factual, never shaming. Every template is checked against `BANNED_WORDS` ("missed", "failed", "didn't", "streak"…).

**Cost:** the morning and evening rows read yesterday's or tomorrow's plan only when that nudge is due. The block-start check adds one read per job run only while it is on.

## Differences from the plan

- **The evening keeps its trigger.** It still goes out only when nothing was recorded all day, now with the facts. A recap of a day with recorded work stays in Close the Day, which already shows it. This avoids a fourth daily notification.
- **Move is still "Move to tomorrow".** The smart rescheduling in the concept ("Move to 20:30", using best hours) is WI-041.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `prisma/migrations/20261027090000_coach_nudges/`, `tests/coach-domain.test.ts`, `tests/coach-database.test.ts`, `tests/coach-nudges-migration.test.ts`, `docs/screenshots/wi-039/`                                                                                                                                                                                                                                            |
| Changed | `prisma/schema.prisma` (`StudyNudgeSetting.blockStartEnabled`/`blockStartMinutes`, `NotificationType.STUDY_BLOCK`), `src/server/health.ts`, `src/features/nudges/{domain,service,actions}.ts`, `src/features/nudges/{card,forms}.tsx`, `src/features/notifications/service.ts`, `src/features/push/domain.ts`, `src/features/today/attention.tsx`, `src/app/settings/page.tsx`, `docs/engineering/notifications-pwa.md`, docs |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree. `pnpm test:ci`: 76 files, 462 tests                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Migration                                | A fresh `migrate deploy`, and `migrate diff --exit-code` = 0. The upgrade test keeps an existing setting, adds the block-start fields off at 15 minutes, refuses an offset of 2 and accepts `STUDY_BLOCK` rows. Seed run twice                                                                                                                                                                                                                                                                       |
| Tests                                    | **Domain 5:** due from start plus N until the block ends; silent when off, recorded, skipped, rested, closed, running, quiet, paused or capped; the fact templates; no banned word; the Settings line and offset validation. **Database 4:** one nudge per block and one a day, a general lock-screen line and path, the Today card kind and closing; silent with a session; upcoming and overdue reminders skip study blocks but keep others; morning and evening facts from yesterday and tomorrow |
| Browser, desktop                         | The Settings panel shows "When a study block starts" with the minutes; saving made the row read "Block start +15 min · …". A dev block that started 20 minutes earlier gave one in-app nudge from the local job. Today showed "Block started" with its facts and buttons. Let go asked first, then skipped the block ("Skipped: Let go") with Undo. axe was clean                                                                                                                                    |
| Browser, 375                             | The card at full width, buttons wrapping, no overflow; axe clean                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Screenshots: `docs/screenshots/wi-039/`.

## Owner steps

1. **Before merging,** apply the migration to production from your own terminal, as before (`read -rs` for the Supabase URL, then `pnpm db:deploy`).
2. **After the deploy,** turn on "When a study block starts" in Settings → Reminders → Study nudges when you want it. Remove the production test records first (`pnpm data:check` = 0), as with the other nudges.
