# WI-094 handoff — the revision ladder and the next problem

Date: 2026-10-31. Branch `feat/wi-094-revision-ladder` from `main` `becd275` (WI-093). ADR-029.

**Source.** The owner asked why Next problem was "3Sum" (alphabetical: the first untried problem by title) and then how revision should work: solve a problem, revise it on the third, seventh and fourteenth day from that day, see a skipped revision as missed rather than overdue, and see both the next problem and the due revision in the head.

**Migration:** `20261101000000_revision_ladder`. Adds `DsaProblem.revisionStartedOn` (DATE) and `revisionOutcomes` (TEXT[] of `revised` / `missed`), and clears the WI-003 confidence-driven dates (`nextRevisionAt`, `revisionStage`, `revisionManual`). Production has no attempts, so nothing is lost; a problem attempted before the migration would show Start revision. `LATEST_MIGRATION` names it, so `/api/health` reads `migration-pending` from the deploy until the owner applies it.

## What changed

| Where                   | Was                                                                         | Now                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules (`dsa/domain.ts`) | `revision(confidence, stage, day)`: Shaky +1, Okay +3, Solid 7 / 14 / 30.   | `LADDER_DAYS = [3, 7, 14]`; `startLadder(day)`, `markRevised(p)`, `settleLadder(p, today)` (passed steps become `missed`, several at once), `ladderState(p, today)` (`unattempted` / `none` / `due` / `upcoming` / `finished`, the steps with their days and outcomes), `ladderLine` for the screen, `nextProblemFor`.                                                                   |
| `recordAttempt`         | Set the next date from the confidence.                                      | Starts the ladder on the first attempt (or after a finished one); an attempt while a step is open counts as that revision. The confidence sets no date.                                                                                                                                                                                                                                  |
| Service                 | `scheduleRevision` on any attempted problem.                                | `scheduleRevision` moves the open step only; `startRevision` begins a ladder today; `markRevised`; `settleRevisions` / `settleRevisionsIn` run in `dsaSnapshot` (now takes `now`) and before the DSA reminder counts, so nothing reads as overdue.                                                                                                                                       |
| Problem page            | Revision fact with Overdue since / Due today / a date.                      | "Revision 1 of 3 · Due today", "2 of 3 · Nov 7 · missed 1", "Revised 3 of 3", "Missed 3 of 3", Not started; `RevisionLadder` (`dsa/ladder.tsx`): three tiles with Mark revised (primary when due) or Start revision. Change revision date only while a step is open.                                                                                                                     |
| List                    | Primary Revise when due, else Next problem by title; rows "Overdue Oct 29". | Primary **Next problem** by `nextProblemFor` (core problems first: current topic → latest attempt's topic → next topic in order; More practice once every core is tried), **Revise · title · n of 3** beside it when due today; the working topic's band opens; rows carry the ladder line; the Show filter "Missed a revision" replaces Overdue; the facts say "Working on … · next …". |
| Today, review           | "Review Two Sum · Revision due today · Okay"; "Revisions overdue".          | "… · Revision due today · 1 of 3 · Okay"; the review counts "Revisions missed" and carries problems with a missed step and a step still to come.                                                                                                                                                                                                                                         |
| Seed                    | The example attempts walked the old rule.                                   | They walk the ladder (`prisma/seed.ts`).                                                                                                                                                                                                                                                                                                                                                 |

## Tests

- `tests/dsa-domain.test.ts`: the ladder (steps from the solve day, revised keeps later days, missed settles and chains, finished lines, no ladder states) and `nextProblemFor` (first topic, the latest attempt, a done topic moves on, the current topic wins, wrap-around, nothing left). The three `revision()` tests are replaced.
- `tests/dsa-database.test.ts`: the ladder through the service (start, revise by attempt, move by hand, Mark revised to the end, a new ladder after), settlement (one step, weeks away), Start revision; the reminder test now expects no reminder the day after a missed step and one again on the next step's day.
- `tests/review-database.test.ts`: the carry fixture is a ladder with a missed step.
- `e2e/journeys.spec.ts`: the first attempt shows "1 of 3" and the ladder's first tile.

## Gate

- `pnpm typecheck`, ESLint and Prettier clean; `pnpm test:ci` on a fresh database; `pnpm build`; `pnpm test:e2e` and `pnpm test:e2e:safari`; `pnpm docs:check`; `git diff --check`.
- Schema gate: clean `db:deploy` on a fresh database; the upgrade from `20261031000000_problem_url_optional` with an old-style row (its dates cleared, the new columns null / empty); `prisma migrate diff --exit-code` clean; the seed twice and `scripts/verify-seed.ts`.

## Production

1. Start Docker PostgreSQL 17 at 5433 for the restore check (the Homebrew 16 cannot restore a 17 dump), then `pnpm db:backup` and `pnpm db:restore:verify <file>`.
2. `pnpm db:deploy` against the Supabase URL (the owner's terminal, `read -rs SUPABASE_URL`).
3. Merge and deploy; `/api/health` reads `schema: "current"` once both are done.
