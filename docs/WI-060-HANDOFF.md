# WI-060 handoff — Rumi anywhere, a better running session, delete everywhere, and a faster app

Date: 2026-10-28. Branch `feat/wi-060-rumi-anywhere` from `main` `1cdc2b9` (WI-059).

**Source.** The plan is `output/Silsila-WI-060-Plan.pdf` (not committed). It was written after a read-only walkthrough of production, query counts on a local production build, and phone screens.

**Owner's decisions (2026-10-28).**

- All eight parts in one work item.
- Plan takes Rumi's place on the phone bar.
- An imported problem is hidden, not deleted.
- The goal's target role is included.

**Migration:** `20261028150000_goal_role_problem_hidden`.

## What changed

### E · Speed

- **No prefetch.** Every `<Link>` that still prefetched now has `prefetch={false}` (57 links). The rule since WI-010 had missed the lists: Practice problems, roadmap rows and items, job summaries, Learn, the problem page, review history and others.
- **One roadmap read.** `roadmapList` is memoized (ADR-017), so For today and the overview share one read of every item.
- **Today's goal line** comes from the goals Today already loads, not from `goalsOverview`.

**Local statements per page** (PostgreSQL `log_statement`, first visit after the 20-second cache):

| Page          | WI-059 | WI-060                                      |
| ------------- | ------ | ------------------------------------------- |
| Today         | 60     | 61 (adds the goal line and the nudges card) |
| Practice      | 59     | 31                                          |
| Roadmap       | 43     | 36                                          |
| Weekly review | 37     | 31                                          |
| Settings      | 37     | 34                                          |
| Jobs          | 26     | 22                                          |
| Plan          | 22     | 18                                          |
| Rumi          | 18     | 14                                          |

The plan's target of under 40 for Today is not met. Its reads are spread over the agenda, the week's facts, attention, setup, noticed and the session look-ups of the page's own requests. A shared Today snapshot is the next step. Hosting on Render's free instance (0.1 CPU) remains the owner's call.

### F · For today and the phone Roadmap

- **Curriculum order.** `curriculumOrder` (`src/features/dsa/domain.ts`) orders problems by topic order, then Easy → Medium → Hard, then core before "More practice". For today uses it, so with no current topic the pick is the list's first.
- **Phone layout.** On a phone the Roadmap's main column (For today, This week, Roadmaps) comes before its revision rail.
- **No duplicate.** The rail leaves out the item For today already offers.

### A · Rumi from any page

`RumiDrawer` (`src/features/agent/drawer.tsx`, mounted in the layout when AI is configured) is a round button at the bottom right.

- **Where it shows:** every page except /rumi, /focus, /login and /privacy. On a phone it sits above the bar.
- **The drawer:** the button opens a drawer beside the page (a bottom sheet on a phone) holding the same `RumiChat` in `drawer` mode.
  - The address never changes.
  - Delete resets the drawer, and **Open full page** goes to `/rumi?c=<id>`.
  - The chat stays mounted while the tab lives, and a page refresh no longer clears it.
  - Esc closes the drawer.
- **One way in.** `askRumi` (`src/features/agent/events.ts`) is the single handover, used by ⌘K "Ask Rumi · …", Plan with Rumi and Rumi noticed. It opens the drawer where the page has one, the open Rumi page, or /rumi.
- **Navigation.**
  - The sidebar now reads Today, Plan, Roadmap, Practice, Jobs, Weekly review, Settings, Ask Rumi.
  - The phone bar reads Today, Plan, Roadmap, Jobs, More.

### G · The composer without the cost line

`nearCap` (`src/features/ai/domain.ts`, 80% of the US$3 month) decides the line. `askRumi` results carry `nearCap`, and the line shows only then. `budget` stays in the results, which the agent test checks. Settings → AI keeps the full figure.

### B · Today while a session runs

The launcher's running state now behaves like a small Focus:

- **Countdown.** It counts down to `focusTarget` (`LiveCountdown` in `src/features/execution/live.tsx`): "19:59 left of 20 min", with a thin progress bar and "Time is up" at the end.
- **Intention.** It shows the session's intention (`intentionOf`). `RunningLike` gains `notes`.
- **Buttons.** `ExecutionControls` in launcher mode offers Focus, Stop and **Complete** as the primary.
- **One timer.** `.shell:has(.launcher.is-live) .running-now` hides the sidebar card and the phone strip, so Today shows one timer.

### C · The goal on Today, with a target role

- **Today.** Under the facts line, Today shows `goalLine` for the nearest active goal, with Edit goal (or Set a goal) opening `GoalForm` in a panel there.
- **Target role.** `Goal.targetRole` is optional, validated in `goalInput`, and saved by `saveGoal`. It reads in `goalLine` as "Offer from a product company (Backend engineer)".
- **Rumi.** Rumi's `systemPrompt` adds the nearest active goal with its date and role, as the owner's words.
- **Prep searches** are unchanged: they already use the application's role.

### D · Delete on every record

The functions live in `src/features/deletes/`: `service.ts` (every delete under the owner lock), `actions.ts`, and `domain.ts` (`DELETED`, `isDeleted`). The shared `ConfirmDelete` (`src/components/confirm-delete.tsx`) asks once, in place.

| Record                                     | How                                                                                        | Way back                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| Block added for one day (no recorded time) | cancelled as "Deleted": Google drops its event, Today and Plan leave it out                | Undo (`block-reset`)                |
| Logged session                             | deleted from the block's panel                                                             | Undo (`restore-session`)            |
| Prep item or weak area                     | × beside it                                                                                | Undo (`restore-prep-item`)          |
| Interview                                  | panel → Delete interview; its block is "Deleted"                                           | confirmation                        |
| Application                                | Edit application → Delete application (rounds, prep, history, prep docs, unread reminders) | confirmation, then /jobs            |
| Practice problem the owner added           | deleted with its attempts                                                                  | confirmation, then /dsa             |
| Imported practice problem                  | **hidden** (`DsaProblem.hiddenAt`), left out of every list, revision and command           | Show again; Undo (`problem-unhide`) |
| Goal                                       | deleted; roadmaps, routines and blocks are kept, unlinked                                  | confirmation                        |
| Roadmap                                    | deleted with its items, beside Archive                                                     | confirmation, then /roadmap         |

Rules kept:

- **Blocks.**
  - A routine's block is cancelled, not deleted.
  - A block with recorded time keeps it until its sessions are deleted. The `completion_consistency` constraint also requires `completedAt` to be cleared when a block is cancelled.
- **History.** Single attempts, stage changes and activities stay append-only. They go only with the record they belong to.
- **Logging.** Failures log `[deletes] failed <ErrorClass> <code>`, added to the security doc's log vocabulary.

### H · Reminders you can see

- **Today card.** `NudgesOffCard` (`src/features/nudges/off-card.tsx`) appears in Today's rail while every study nudge is off: "Study nudges are off", Turn on in Settings, and Dismiss (`silsila-nudges-card-hidden`, 30 days). The app never turns nudges on by itself.
- **Last sent.** `lastSentText` (`src/features/settings/domain.ts`) adds "Last sent Oct 28, 08:00" to each reminder row, taken from the latest inbox row of those types.
- **No new setup step.** "Turn on study nudges" did not join the setup steps. That keeps Make Silsila yours at six and leaves the first-run journey's contract unchanged; the card does the same job.

## Tests

| Where                                | What it checks                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/deletes-database.test.ts`     | Application delete: rounds, prep and reminders go, and the interview block becomes "Deleted". Block delete with Undo; a routine block is refused, and so is a block with recorded time. Prep item and session delete with Undo. An imported problem is hidden and an added one deleted. Goal delete unlinks its roadmap. Roadmap delete takes its items. |
| `tests/rumi-anywhere-domain.test.ts` | `curriculumOrder`, `nearCap`, `lastSentText`, `goalLine` with a role, the goal line in `systemPrompt`, `isDeleted`                                                                                                                                                                                                                                       |
| `tests/goal-role-migration.test.ts`  | The upgrade keeps existing goals and problems with no role and not hidden                                                                                                                                                                                                                                                                                |
| `tests/production-database.test.ts`  | `LATEST_MIGRATION` is the new migration                                                                                                                                                                                                                                                                                                                  |

## Production

1. Take a verified backup (`docs/engineering/backup-restore.md`).
2. Run `pnpm db:deploy` against Supabase from the workstation. The new migration only adds two nullable columns.
3. Merge and deploy. `/api/health` reports `schema: current` once both are done.

## Gate

- `pnpm typecheck` passes.
- `eslint .` is clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a disposable database: 106 files, 588 tests.
- `pnpm build` passes.
- `prisma migrate diff --exit-code` reports no drift.
- The e2e journeys and the browser checks are listed under Verification.

## Verification

These were checked on the local production build with seeded data. axe was clean on every screen below, there were no console errors, and there was no overflow at 375.

**Today:**

- The goal line reads "Offer from a product company · 7 weeks left".
- The sidebar ends with Ask Rumi.
- With nudges off, the card shows, and its Dismiss hides it.

**Rumi drawer:**

- The drawer answers on Today without changing the address. It keeps both messages after closing and reopening, and has no cost line.
- The round button is gone on Focus.

**Running session:**

- The launcher reads "19:59 left of 20 min" with the intention, and Complete first.
- The sidebar timer is hidden.
- Complete says "Done. Nothing else is planned today."

**Deletes:**

- Deleting an added block removes its row, and Undo brings it back.
- Hide on an imported problem shows the banner, and Show again works.
- Deleting Wealthsimple removes it from Jobs.

**Phone (375 px):**

- Roadmap puts For today at y = 209 and the revision rail at y = 1,979.
- The bar reads Today, Plan, Roadmap, Jobs, More.
