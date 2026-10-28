# WI-058 handoff — UI and UX audit fixes

Date: 2026-10-28. Branch `feat/wi-058-uiux-audit-fixes` from `main` `1a0bb59` (WI-057). This work item delivers every fix proposed by the UI and UX audit of 2026-10-28 (`output/Silsila-UI-UX-Audit.pdf`, not committed). The audit proposed them as WI-058 to WI-064; the owner asked for one work item. No migration.

## What changed

### Trust (audit P0)

- **Application crash.** `label` (`src/features/jobs/domain.ts`) returns `''` for an empty value instead of throwing. A stage change without its from-stage reads "Moved to Technical" on the application's timeline (`src/app/jobs/[id]/page.tsx`).
- **Reminder preview.** `remindersPreview` (`src/features/notifications/preview.ts`) treats a missing preference as off, the way the scheduler reads it (it loads enabled rows only). It shows the stored 24-hour time, and `clock12` is deleted. Weekly review step 3 lists only the reminders that are on, or "No reminders are on."

### Accessibility

**Contrast (WCAG 1.4.3).** These now use `--ink-2` on tints:

- `.pill`
- `.stepper a`
- `.pattern-band-meta`
- `.command-text span`
- `.week-col.is-today .week-col-label`

**Names and focus:**

- Practice's buttons are named `Make current: <topic>` (WCAG 2.5.3).
- `ScheduleInterviewForm` takes the round's `name`, so each round's form has its own label. This fixes axe's landmark-unique finding.
- `.date-jump input:focus-visible` draws the focus ring.

**False positive.** The audit's "page-wide container takes focus" on roadmap item and Rumi was the tab order wrapping past the end of the document to the body. It is not a real stop, and nothing changed for it.

### Today

- **Honest counts.** Rumi noticed rows count toward the five shown and the total, and they also appear in the View all panel (`src/features/today/attention.tsx`). On a phone, `data-phone-rows` hides list rows so noticed plus list stay at two.
- **Folded revision rows.** `foldRevisionRows` (`src/features/attention/domain.ts`, `FOLD_REVISIONS` = 2) folds more than two Practice or Roadmap revision rows into one row. The folded row links to `/dsa#revision-queue` or `/roadmap#revision-heading` and gives the oldest due date. Only Today folds; Roadmap's own rail still lists every item.
- **One column.** Below 1100 px the order is launcher, Your day, Needs attention, then Make Silsila yours (CSS `order`).
- **No repeated kind.** `rowMeta` (`src/features/schedule/row.ts`) and the launcher leave out a kind that only repeats the block's title. The launcher's current block now says "Until 09:00".
- **Empty day.** An empty day with routines links "Open the week on Plan" (`Agenda`'s `hasRoutines`).
- **Fresh start.** `idleCards` (`src/features/noticed/domain.ts`) counts a never-recorded kind as silent from the first day it was planned, capped at 28 days. It reads "No DSA recorded since Oct 21", so a fresh start says nothing on its first mornings.

### Roadmap

- **Guide sections.** `isGuideSection` (`src/features/roadmap/domain.ts`) marks sections starting "How to use". `nextItem`, and through it Continue and each roadmap's Next, picks study first and the guide only when nothing else is left. `formatPractice`'s `next` (`src/features/jobs/formats.ts`) does the same for This week and an application's Interview formats card.
- **This week line.** `weekPlan` also returns `p0Left`. When a goal line is in the header, This week reads "P0 first · N not done" instead of repeating the goal.
- **Met rows.** A met row reads "2 done" instead of "2 of 1".

### Practice

- **One primary.** The header's primary is **Revise · <title>** (the first due revision), else **Next problem · <title>** (the current topic's next unattempted problem, else the first unattempted problem).
- **Topics panel.** Topics move into a `topics` side panel, opened from a Topics button.
- **Band names** sit left in ink, with the counts and chevron after them.
- **Eyebrow.** The "DSA" eyebrow is removed.

### Applications

- **Prep inside the round.** Prepare with Rumi (the docs, Prepare again, and the panel) renders inside the first upcoming scheduled round. The rail keeps it when no round is upcoming.
- **Buttons.** Round actions (Log the result, Add prep, Reflection, Reschedule, Add to schedule) are small secondary buttons.
- **Phone stage control.** At 640 px and below, the stage buttons are replaced by a second form: a Stage select (labelled by id, so its name is "Stage" only) and Move. It posts to the same `stageAction`.
- **Official sources.** `isOfficial` (`src/features/prep/domain.ts`) also accepts the company name without trailing suffix words (`COMPANY_SUFFIXES`: Labs, Inc, Technologies and others). `clip` cuts at a word boundary.
- **Formats card.** Kept as it is. It lists the application's ticked formats, which can differ from booked rounds, so folding it into the round would lose them.

### Focus

- **Early starts.** `focusTarget` gives an early start the block's planned length, as a late start already had.
- **Shell chrome.** `.shell:has(.focus-card)` hides the phone bar and the running strip.
- **Esc hint.** The hint is hidden under `pointer: coarse`.

### Weekly review, Settings, Rumi

**Weekly review:**

- Prepare next week is a secondary button.
- Priorities and history use `weekLabel` ("Week of 2 – 8 November").
- The target label reads "Target (optional)".

**Settings:**

- Make Silsila yours shows only while Today's card is hidden (`SETUP_COOKIE`).
- The header keeps only Sign out; Download my data stays in Data.
- Every setting row has one teal tile.
- Day print reads "On (default)".

**Rows:** a done, skipped or cancelled row keeps its ⋯ on the status line from 861 px up.

**Rumi:**

- **Left out list.** The plan card lists the blocks that will be added. Conflicts, and blocks the owner takes out with ×, sit under **Left out · N**, and a taken-out block has Put back.
- **Skipped blocks.** `applyProposal(..., skip)` and `addable(p, skip)` leave out the positions the owner removed. The action validates `skip` as integers.
- **Same titles.** Conversations with the same title show their time.

## Tests

| Where                          | What it checks                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `tests/jobs-domain.test.ts`    | `label('')` is `''`                                                                     |
| `tests/noticed-domain.test.ts` | a fresh start is quiet; a kind planned six days ago reads "No DSA recorded since …"     |
| `tests/roadmap-domain.test.ts` | `nextItem` passes over the guide while study is left, and returns it when it is alone   |
| `tests/focus-domain.test.ts`   | an early start gets the planned length                                                  |
| `tests/prep-domain.test.ts`    | "Northwind Labs" counts northwind.jobs and northwind-labs.com, not labs.example.com     |
| `tests/agent-plans.test.ts`    | taking out every block that fits adds nothing                                           |
| e2e journeys                   | all seven pass with axe; the application journey checks formats with the select present |

## Production

Nothing to run: merge and deploy.

## Gate

- `pnpm typecheck` passes.
- `eslint .` is clean, and Prettier is clean on every changed file. Prettier's local warnings are only files in `.git/info/exclude`.
- `pnpm test:ci` on a disposable database: 102 files, 571 tests.
- `pnpm build` passes.
- `pnpm test:e2e`: 7 passed.
- `pnpm test:e2e:safari`: 7 passed.
- `pnpm docs:check` passes.
- `git diff --check` is clean.

## Verification

The audit's capture was re-run on the same seeded workspace: 141 page states at 1440 and 375, light and dark, Chromium and WebKit.

| Measure                                                | Before                            | After                        |
| ------------------------------------------------------ | --------------------------------- | ---------------------------- |
| axe violations (WCAG 2.2 AA)                           | 174 nodes on 28 states            | 0                            |
| Pages with two primaries                               | Weekly review step 3              | none                         |
| CLS above 0.1                                          | 0.267 on a roadmap item deep link | none                         |
| Horizontal overflow at 375                             | none                              | none                         |
| Application with a stage change without its from-stage | crashed                           | renders "Moved to Technical" |

Also checked:

- With the Practice Topics panel open, axe finds no violations at 1440 or 375.
- On Rumi's plan card, × moves a block to Left out and the button reads "Add block to plan". Put back restores "Add 2 blocks to plan". axe finds no violations.

Phone panels that open from More (Today's review, Plan's routines) were not captured. That is a limit of the capture script, not of the app.
