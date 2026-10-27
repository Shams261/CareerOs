# WI-043: Rumi noticed

Date: 2026-10-27. Branch `feat/wi-043-rumi-noticed` from `main` `228a98c` (WI-042). This is the last item of the Rumi plan (`docs/product/rumi-plan.md`). No AI: every row is found by code and written from a fixed template. One migration.

## Outcome

Needs attention on Today can start with up to **two Rumi noticed rows a day**. Each has one action and **Dismiss**.

| Rule (in this order)                                                                                            | Row                                                                  | Action                                                                |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| An interview 1–3 days out with prep items open (today's stays the existing prep row)                            | "Fabrikam Coding in 2 days, 1 prep item open · Thu, Oct 29 at 08:03" | **Open prep** (the round on the application)                          |
| A study kind silent for 5 days or more, planned or recorded in the last 4 weeks                                 | "No Backend recorded in 9 days · Last on Oct 18"                     | **Plan it with Rumi** (asks Rumi to plan it between today and Sunday) |
| A routine left (no session, not done) on every occurrence for 3 weeks, at least one a week                      | "Morning DSA at 06:00 was left 3 weeks running"                      | **Open routines** (the Plan's routines panel)                         |
| Today or tomorrow planned at twice the usual recorded study or more, and 90 minutes more (needs 5 days of data) | "Tomorrow plans 6h of study; you usually record about 2h"            | **Open Plan** (that day)                                              |

**Rules of the rows:**

- Study kinds are the owner's own: Settings → Study nudges → Study categories, plus DSA and Technical. Work, gym and personal never count.
- Test-named records never count.
- Every template is checked against `BANNED_WORDS`. There is no score, no streak and no "missed".

**Answers.** An action hides its row for 3 days and Dismiss for 7. Both are stored as a `NoticedAnswer` (`actedAt` or `dismissedAt`), so acted versus dismissed is the plan's usefulness measure. Answers are in the export.

**Cost.** One memoized snapshot behind Today's existing Needs attention Suspense: five reads, only on Today.

## Differences from the plan

- **"Move it to 20:00?"** is not proposed in the routine row. Open routines opens the routine editor, whose existing preview shows what a change would do. A suggested time needs free-slot and best-hours logic in the editor, a separate step.
- **The rows sit above the queue in Needs attention,** not inside its urgency order and not in its count, so they never push a due task off the five-row preview.

## Changes

| Area    | Files                                                                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `prisma/migrations/20261027180000_rumi_noticed/`, `src/features/noticed/{domain,service,actions}.ts`, `src/features/noticed/rows.tsx`, `tests/noticed-domain.test.ts`, `tests/noticed-database.test.ts` (with the upgrade test), `docs/screenshots/wi-043/` |
| Changed | `prisma/schema.prisma` (`NoticedAnswer`), `src/features/today/attention.tsx`, `src/features/command/bar.tsx` (`openPanelAfterNavigation`), `src/server/{export,health}.ts`, `src/app/globals.css`, docs                                                     |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree. `pnpm test:ci`: 85 files, 522 tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Migration                                | A fresh `migrate deploy` and `migrate diff --exit-code` = 0. The upgrade test allows one answer per card and owner, refuses an unknown kind, and cascades with the owner. Seed run twice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tests                                    | **Domain 6:** a kind silent for 6 days is named, 4 days is not, and a kind never used is never named. An interview 1–3 days out with open prep comes first, and the day caps at two. A routine left in each of three weeks is named, but not once recorded. A heavy day is named and a normal one is not. An answered card stays away until its day. No template uses a banned word. **Database 2:** real sessions and rounds make the interview and idle rows, test-named applications and gym sessions never do, answers hide rows with their kind and day, and a dismissed row returns after a week. The owner's own study categories (Backend) count, another owner's records never do |
| Browser, desktop                         | With dev records, Today showed "Fabrikam Coding in 2 days, 1 prep item open" and "No Backend recorded in 9 days". Dismiss hid the first and the next rule's row ("Today plans 3.5h of study; you usually record about 1h") took its place. Plan it with Rumi opened Ask Rumi with "Plan a Backend block in my free time between today and Sunday." and a plan card. Both answers were stored with 3 and 7 days. axe clean                                                                                                                                                                                                                                                                  |
| Browser, 375                             | The rows stack the action and Dismiss under the text, no overflow, axe clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Screenshots: `docs/screenshots/wi-043/`.

## Owner steps

1. **Before merging,** apply the migration to production from your own terminal, as before (`read -rs` for the Supabase URL, then `pnpm db:deploy`).
2. **After the deploy,** the rows appear on Today when a rule holds. Tick your own study kinds (such as Backend) under Settings → Study nudges → Study categories, so they count.
3. The Rumi plan is complete with this item. Next is the full UAT the plan names, and two weeks of real use to read the measures: proposals added, prep docs kept, and noticed rows acted on versus dismissed.
