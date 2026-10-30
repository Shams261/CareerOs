# WI-083 handoff — Plan as one list

Date: 2026-10-30. Branch `feat/wi-083-plan-list` from `main` `1e6c430` (WI-082).

**Source.** The owner asked for a minimal Plan. Of three drawn options (one list with days as dividers; seven columns; one day at a time) the owner chose the first.

**Migration:** none.

## What changed

| Part        | Where                                                                          | What                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The groups  | `src/features/schedule/week-list.ts` (pure), `tests/week-list.test.ts`         | `weekGroups` turns the seven days into groups: a day with blocks, or today, on its own; empty neighbours with the same line merged ("Mon 26 – Tue 27"); `groupName`, `dayName`, `weekRange` ("26 Oct – 1 Nov", "19 – 25 Oct").                                                                                                                                                                               |
| The list    | `src/app/calendar/page.tsx`, `globals.css` (`.plan-list`, `.plan-dayline`)     | One `section.agenda.is-compact` with one `ol.agenda-rows`: a `li.plan-dayline` per group (the day as a link to Today, its line, today's "+ Add a block") followed by its `BlockRowShell` rows at Today's compact size. The `agenda-details` › reaches over the whole row (`::after`), so the row opens the block on Today. On a phone the › sits at the row's right edge and an empty status line is hidden. |
| The header  | `src/app/calendar/page.tsx`                                                    | Plan · the week range · ‹ › (· This week when elsewhere) and one More (`UtilityMenu`: the date field and Routines · N / Add routine). The facts read in bold numbers like Today's (`.today-facts`): "4 blocks planned · 3 done · 1 needs update · 1h 40m planned"; zeros stay out.                                                                                                                           |
| The rail    | `src/app/calendar/page.tsx`, `globals.css` (`.routines-card`, `.routine-list`) | `today-workspace is-today` with the list in the agenda area and a `today-rail`: `WeekCard` (only when the shown week is this week), a Routines card (up to five routines with their days and start, "N on", a corner link that opens the panel and reaches over the card) and the Google Calendar line. On a phone the rail stacks under the list.                                                           |
| Add a block | `src/app/calendar/page.tsx`                                                    | Today's `BlockForm` in an `add-block` modal, for today, with `nextSlot`; shown only when this week is shown. The `n` shortcut presses it, `r` opens Routines.                                                                                                                                                                                                                                                |

Removed: the seven `week-day-section`s and their CSS, the "Week of …" label, the visible Routines button.

## Tests

- `tests/week-list.test.ts`: merging and keeping apart (blocks, today, differing lines), names and ranges.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 120 files, 641 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright)

- Desktop 1366: header "Plan 26 Oct – 1 Nov ‹ › More", facts "4 blocks planned · 1 done · 2h planned", chips with counts, lines "Mon 26 – Wed 28 Nothing planned", "Thu 29 1 block · 30 min planned", "Fri 30 Today · 1 block · 30 min planned + Add a block", "Sat 31 …", "Sun 1 …"; rows 53 px; the rail This week (186 px) → Routines (150 px) → Google line; the page 823 px tall (1150 before); Add a block opens the "Add a block" modal; a click on the Routines card opens the "Routines" panel; More holds the date field and "Routines · 1"; axe clean; no console errors.
- Next week (`?date=2026-11-04`): "Plan 2 – 8 Nov ‹ › This week", "Nothing planned", one line "Mon 2 – Sun 8 Not planned yet", the Prepare next week form, no This week card.
- Phone 390: no overflow, axe clean, the › at the row's edge, the rail under the list.

## Production

Merge and deploy; there is no database step.
