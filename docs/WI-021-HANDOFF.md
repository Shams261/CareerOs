# WI-021 — Plan: the week as days

Date: 2026-10-23. Branch `feat/wi-021-plan-days` from `main` `1d00507` (WI-020). First of the four work items that make Plan, Jobs, Roadmap and the Weekly review read like Today (ADR-019); the owner chose the order Plan → Jobs → Roadmap → Weekly review, 24-hour times across the app, and counts as records without bars or ratios.

## Outcome

Plan was a 7-column grid of 12-hour cards that said "overdue — not recorded" behind a Routines form. It now reads like Today, seven times:

- **Header.** "Plan" with "Week of 19 – 25 October" beside it, the week navigation and the date field on the same line, and one utility on the right: "Routines · N" (styled as the primary "Add routine" when none exist). One factual line from `factsLine(blockFacts(...))`: "10 blocks planned · 1 done · 5 not recorded · 2 recorded, needs update · 8h 15m planned" (zeros stay out; cancelled blocks are not counted).
- **Week strip.** Seven chips ("Thu 22 · 7"), today highlighted, each an in-page anchor to its day; the week at a glance the grid used to give. On phones the strip scrolls sideways.
- **Days.** Seven stacked sections, each headed by the day name as the single link to that day on Today (P-7), a count line ("7 blocks · 5h 45m planned", "Nothing planned", "Not planned yet") and the shared block rows: `hhmm | dot | title with its category icon + meta | status + chevron`. Statuses are Today's words (Done, Not recorded, Recorded · Needs update, Now, In session, Upcoming, Skipped, Cancelled); the meta line is Today's (`rowMeta`), with " · Google: pending" appended when a connected calendar has not synced the block. A block the Jobs round form named "Company — Round" shows the round's title here too (the linked rounds load in one query, only when such blocks exist). The chevron opens the block on Today (`/today?date=…#block-id`, labelled "Open Reading on Today, Thu 22"). No Start, ··· or forms on Plan: acting belongs to Today.
- **Routines** live in a side panel (`SidePanel id="routines"`): "Add routine" (the compact form, open by default when none exist, draft `routine:new`, P-11) above the routine rows; each Edit is labelled "Edit routine {title}" for assistive tech through the new `Disclosure srLabel` (P-9); the propagation preview and "Remove routine (preview first)" work unchanged inside the panel. `N` opens the panel; Escape closes it and returns focus to the button. Nothing precedes the week on a phone (P-6).
- **Prepare next week** stays inline under the days when the viewed week is not planned; the Google status line stays at the foot. The generation alert reads "This week could not be planned from your routines: …" (P-12).
- **The grid is gone**: `.week-grid`, `.week-day`, `.week-block` and their breakpoints are deleted (P-5 with them). `executionLabel`/`executionTone` stay for their tests; Plan no longer calls them.

## Shared groundwork (used by WI-022 … WI-024)

- **24-hour time everywhere.** `hhmm(date, zone)` ("06:00", "19:30") lives in `src/lib/time.ts`; `clock` is now the same function and deprecated. Every `h:mm a` / `h:mm` literal in the app switched (`src/app/{dsa/[id],jobs/[id],jobs,review}/page.tsx`, `src/features/{calendar,jobs}/domain.ts`, `src/features/notifications/{service,preview}.ts`, `src/features/schedule/editing.ts`, `src/features/today/agenda.tsx`). The four tests that pinned 12-hour strings now pin the 24-hour ones (`tests/time-integrity.test.ts`, `tests/jobs-domain.test.ts`, `tests/jobs-database.test.ts`).
- **The shared block row.** `src/features/schedule/row.ts` (pure) now holds `BlockLike`, `SessionLike`, `Resolution`, `blockResolution`, `resolutionText`, `blockTitle`, `formatDuration`, `recordedMinutes`, `rowMeta`, `blockFacts` and `factsLine`; `src/features/today/domain.ts` re-exports the moved names so `tests/today-domain.test.ts` runs unchanged. `src/features/schedule/block-row.tsx` renders the `li.agenda-row` skeleton (`BlockRowShell`) and the `StatusIcon`; Today's `BlockRow` is a thin wrapper that passes its actions, Details button and panel through `side` and `children`. Today renders as before (screenshot 04).
- **`Disclosure` gains `srLabel`** (`aria-label` on the trigger) for "Edit" triggers that need the entity name.
- Between 701 and 860 px (tablets) the shared row takes the phone layout (status and actions under the title); between 861 and 1099 px the status column is capped at 42 % and may wrap. Both apply to Today's rows too, where a long status used to squeeze the title at 768 px.

## Changes

| Area    | Files                                                                                                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/features/schedule/row.ts`, `src/features/schedule/block-row.tsx`, `tests/schedule-row.test.ts`, `docs/screenshots/wi-021/`                                                                                       |
| Changed | `src/app/calendar/page.tsx` (rewritten), `src/features/today/{domain.ts,agenda.tsx}`, `src/lib/time.ts`, `src/components/disclosure.tsx`, the 24-hour sweep above, `src/app/globals.css`, the three tests above, docs |

No migrations, no new dependencies, no route changes. Plan loads one extra statement (the blocks' sessions, needed for "Recorded · Needs update") and one more only when a linked interview block exists; neither is memoised (ADR-017).

## Verification

| Check                                           | Result                                                                                                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `typecheck`, `build`, `docs:check` | Pass on a clean export of the branch                                                                                                                                                                            |
| `pnpm test:ci` (disposable database)            | 42 files, 296 tests pass; `tests/schedule-row.test.ts` adds 7 (meta per resolution, running session to now, "under a minute", a block across midnight, facts with cancelled blocks left out and zeros omitted)  |
| Plan at 1440, light and dark                    | Screenshots 01 and 05: header line, strip, days as rows, statuses in Today's words, 24-hour times; no console errors, no horizontal overflow                                                                    |
| Routines panel                                  | Screenshot 02: opens from the button and from `N`; focus lands on the heading, the page behind is inert, Escape closes it and returns focus to "Routines · 1"; Edit is announced as "Edit routine DSA practice" |
| 768 and 390                                     | Screenshots 03 and 06: one column, the strip scrolls sideways on the phone, the first day starts under the summary, no overflow; at 768 the row takes the phone layout on Plan and Today alike                  |
| Today unchanged                                 | Screenshot 04 after the row extraction: same rows, actions and panel                                                                                                                                            |
| Not measured                                    | The statement count was derived from the query shape (+1, +1 when linked blocks exist), not from `log_statement`                                                                                                |

Screenshots in `docs/screenshots/wi-021/`: `01-desktop-week.jpg`, `02-desktop-routines-panel.jpg`, `03-mobile-390.jpg`, `04-today-unchanged.jpg`, `05-desktop-dark.jpg`, `06-tablet-768.jpg`.

## Limitations and follow-ups

- Plan shows every block of a day including cancelled ones (as "Cancelled"); Today collapses them. A long week with many cancellations may want the same disclosure.
- The `clock` alias stays for one work item so nothing outside this branch breaks; WI-024 removes it.
- Next: WI-022 (Jobs as moves, with the three interview-block fixes), WI-023 (Roadmap), WI-024 (Weekly review), per the plan of 2026-10-23.
