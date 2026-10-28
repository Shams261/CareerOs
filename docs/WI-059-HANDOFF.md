# WI-059 handoff — Next step everywhere

Date: 2026-10-28. Branch `feat/wi-059-next-step` from `main` `a20673b` (WI-058). No migration.

This work item comes from six suggestions made by Manus AI. Each was checked against the app in `output/Silsila-Suggestions-Plan.pdf` (not committed), which has the before and after for every part. The owner decided on 2026-10-28:

- Build all six parts as one work item.
- Keep the name "Today" in English.
- Pressure comes as **plain facts**: no streak counter and no pace.
- Rumi's not-recorded row appears **every day**.
- The template chips follow the weekly interview mix, with no Workout chip.

## What changed

### C · For today

`forToday` (`src/features/for-today/domain.ts`, pure) makes at most three picks, each with a reason built from the owner's records:

1. The oldest revision due, from Practice or the roadmap. On the same day a problem comes first.
2. The next item for the nearest interview in this week's mix. With no interview, it falls back to the overview's Continue item.
3. One problem: Red from last time, else the current topic's next untried problem, else any untried problem.

A pick never repeats an earlier one. `forTodayPicks` (`service.ts`) reads `dsaSnapshot`, `revisionDue`, `weekPlan` and `roadmapList`. It is memoized under ADR-017.

`ForTodayCard` (`card.tsx`) leads Roadmap and Practice, and its first Open is the page's primary. Roadmap's Continue button and Practice's Next problem button show only when there are no picks.

### A · The launcher's free time, and Complete

**Free time.** When nothing is current or next (`reconcile`, or `done` before the review), Today loads the picks. The launcher then shows the first pick with **Start 20 min**:

- `startPickAction` calls `startPick`, which adds a 20-minute block from the next whole minute through `saveBlock`. An overlap is refused.
- Focus then opens with `minutes=20`.
- An earlier block without a decision becomes a link in the launcher's next line.

**Complete.** `executionAction` now returns `completedMessage` (`src/features/execution/service.ts`):

- The message is built by `completedLine` (`src/features/schedule/row.ts`), for example "Done · 45 min recorded. Next: System design at 20:00."
- It carries a **Start it** link to the next planned block today.
- Focus publishes the result on the `blocks` channel. `feedback-channel.ts` keeps a result published while no outlet listens for 10 seconds, so the message survives Focus → Today.

### D · Facts you feel

**Header line.** `recentFacts`, `factsLine` and `quietYesterday` (`src/features/today/domain.ts`) give Today's header a second line: "Yesterday: 0 of 3 blocks recorded · This week: 2h 15m recorded of 11h 45m planned".

- A block counts as recorded when it is completed or has a session.
- The week runs from Monday through today.
- The page makes two extra reads, both only for today: blocks from Monday (or yesterday) up to yesterday, and this week's sessions.

**Start from here.** When yesterday had planned blocks and none were recorded, the launcher's eyebrow reads **Start from here** and its context starts with that fact.

- **Let go of yesterday's blocks** calls `letGoDayAction`, which runs `letGoDay` (`src/features/for-today/service.ts`).
- `letGoDay` skips that day's not-recorded blocks under the owner lock with the reason "Let go". Interview blocks are left alone.
- Undo is the new kind `blocks-reset` (`src/features/undo/service.ts`).

**Rumi noticed, every day.** Below the five-day gap, `idleCards` (`src/features/noticed/domain.ts`) names a study kind planned yesterday with nothing of it recorded since: "No DSA recorded yesterday · Planned 1.5h, nothing recorded".

- The key is `yesterday:<kind>:<day>`.
- There are still at most two noticed rows a day.

**Check animation.** A row completed in the last 90 seconds gets `is-just-done`, and its check pops once, only under `prefers-reduced-motion: no-preference`.

**Voice.** CLAUDE.md and `docs/product/brand-system.md` now say "direct facts": counts of the owner's records, never shame words, a streak counter, a score or a pace.

### B · Empty screens

- **Plan:** with no routine and no block this week, one Start here card replaces the seven days ("Add your first routine" opens the Routines panel). The header button hides meanwhile.
- **Weekly review:** step 1 with nothing planned and nothing recorded shows a card with Plan this week and Reflect anyway.
- **Roadmap:** New roadmap is secondary until a goal exists.

### F · ⌘K

`todayCommands` (`src/features/command/service.ts`) adds:

- **Log time** for each block today that ended without a session. It opens the block's panel at the log form, using the new `Command.focus` passed to `openPanel`.
- **Add routine**, which opens Plan's Routines panel. On a day with no blocks it comes first.
- **Add application**, which presses Jobs' Add application. The trigger now has `data-shortcut="add-application"`.
- **Record an attempt** for the oldest due problem, linking to `/dsa/<id>#attempt-heading`.

The sidebar button reads "Search or do". There is no separate "Mark done" command: Done on a past block needs recorded time (Close the Day's rule), and Log time covers that case.

### E · Routine templates

`ROUTINE_TEMPLATES` and `openTemplates` live in `src/features/schedule/templates.ts`, and `TemplateChips` in `template-chips.tsx`. The chips fill title, days, times and category, and Add routine still saves.

- The first-run form shows all five chips.
- Plan's form hides a chip whose title the owner already uses. For DSA, System design and Job search, a routine of the same category also hides it.

`SetupCard` gains `compact`. On the first run, Make Silsila yours stays one line, with Show the steps, until it is opened.

## Tests

| Where                            | What it checks                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/for-today-domain.test.ts` | the three picks and their reasons, with no repeats; the fallbacks (roadmap revision, Continue, Red); `recentFacts`, `factsLine` and `quietYesterday`; `completedLine`; the templates and `openTemplates` |
| `tests/noticed-domain.test.ts`   | yesterday's row every day; it disappears once that kind is recorded; a fresh start now reads as yesterday's fact                                                                                         |
| `tests/command-database.test.ts` | Log time, Add routine and Add application after the existing commands; an empty day starts with Add routine; Record an attempt for a due problem                                                         |

## Production

Nothing to run: merge and deploy.

## Gate

- `pnpm typecheck` passes.
- `eslint .` is clean, and Prettier is clean on every changed file.
- `pnpm test:ci` on a disposable database: 103 files, 578 tests.
- `pnpm build` passes.
- `pnpm test:e2e`: 7 passed.
- `pnpm test:e2e:safari`: 7 passed.
- `pnpm docs:check` passes (101 files).
- `git diff --check` is clean.

## Verification

These were checked on the local production build with seeded data.

**Today:**

- With nothing ahead, the launcher reads Free now with "Revise Online assessment · Revision overdue by 3 days · Technical mastery" and Start 20 min.
- After clearing yesterday's sessions, it reads **Start from here**, "Yesterday: 0 of 2 blocks recorded", with Let go of yesterday's blocks.
- Rumi noticed shows "No DSA recorded yesterday · Planned 1.5h, nothing recorded".
- Start 20 min → Focus → Complete → Today shows "Done. Nothing else is planned today."

**Other screens:**

- Empty Plan and Weekly review show their cards.
- A chip fills System design (Tue and Thu, 20:00).
- ⌘K on an empty day starts with Add routine.
- Plan's chips show only Code review and bug squash, and Behavioural stories.

**Checks:** axe is clean on Today (1440 and 375), Plan, Roadmap, Practice and Weekly review, and there is no overflow at 375.
