# WI-071 handoff — moments that move

Date: 2026-10-29. Branch `feat/wi-071-motion` from `main` `f936513` (WI-070).

**Source.** The owner's UAT after WI-070:

- Add a block and Plan my first focus still felt cluttered.
- Planning a block and completing a session should feel like something: a short motivating moment, and an animated card on Today that gives a sense of progress, within the brand (no streaks, scores or comparisons).
- Skip from a row's ⋯ made the row open vertically with the reason field.

I reproduced the Skip problem on the local build: the ⋯ opened four buttons inline, which squeezed the title to a column of single words and grew the row; the reason field made it worse.

**Owner's choices (2026-10-29):** Skip in a popover; Today's card as the live Day Print rings; subtle, brand-like motion; Add a block in three lines.

**Migration:** none.

## What changed

| Part            | Where                                                                                       | What                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row menu        | `src/features/execution/secondary-actions.tsx`, `globals.css`                               | With `always`, `SecondaryActions` renders `.exec-menu`: the ⋯ opens a stacked menu under it (absolute, 200 px, in the same form so the buttons still submit). Skip asks in place inside the menu; elsewhere `SkipStep` asks in a `.skip-popover` under its button. Escape and a click outside close the menu.                                  |
| Three-line form | `src/features/schedule/quick-fields.tsx`, `globals.css`                                     | `QuickBlockFields`: title; kind chips; start time beside the length chips, with "Ends 11:15 · change" (the end field opens on change) and "+ Add a note" (a hidden empty note submits until then). Edit uses the same fields. 449 px tall at 520 wide.                                                                                         |
| First focus     | `src/features/today/first-run.tsx`                                                          | The picks first; "Or plan it for later today" is a link `Disclosure` holding the form.                                                                                                                                                                                                                                                         |
| Plan line       | `src/features/today/home.ts` (`PLAN_LINES`, `planLine`), `src/features/schedule/actions.ts` | A new block answers with one of three quiet lines and its start time, chosen by the block's id; checked against `BANNED_WORDS` with the rest of `HOME_COPY`.                                                                                                                                                                                   |
| Landed row      | `src/features/schedule/block-row.tsx`, `src/features/today/agenda.tsx`, `globals.css`       | `justAdded` (added in the last 90 s, not a routine, upcoming or current) → `.is-just-added`: a teal wash and a 6 px rise, once.                                                                                                                                                                                                                |
| Done moment     | `focus.tsx`, `block-row.tsx`, `live-summary.tsx`, `header.tsx`, `globals.css`               | On Focus, Complete sets `finishing`: the ring fills and a check pops; Today follows 700 ms later (at once with reduced motion). On Today the just-done check gets `.done-burst` (eight dots, 700 ms), `LiveMinutes` counts up from the minutes this tab last showed (`silsila-focused:<day>` in sessionStorage), and `.form-success` rises in. |
| Today so far    | `src/features/day-print/live.tsx`, `src/app/today/page.tsx`, `globals.css`                  | `LivePrint` renders `dayPrint`'s rings for the open day at the top of the rail, with the session count and the headline. Rings beyond the count this tab last showed (`silsila-rings:<day>`) draw themselves in, staggered. State writes happen in frames, after paint.                                                                        |

All motion sits under `@media (prefers-reduced-motion: no-preference)`; with reduce, the same states show at once and `document.getAnimations()` is empty.

## Tests

- `e2e/journeys.spec.ts`: the block journey opens the end field through "change" before filling it.
- `tests/today-home.test.ts`: `planLine` carries the time, comes from `PLAN_LINES`, and is stable for a block; `HOME_COPY` (now with the plan lines) stays free of banned words.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 116 files, 628 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build at 1366×700, Playwright)

- **Add a block:** the modal is 449–481 px tall with Title, Kind, Start time, Length, "Ends 12:00 · change" and "+ Add a note"; change opened the end field with the value; the note opened; the block was added with "Planned for 11:25. See you there." and its row carried `is-just-added`.
- **Menu:** opening ⋯ and then Skip left the row at 93 px, the menu stacked under the button with the reason field inside; Escape closed it.
- **Complete:** the check showed on Focus 188 ms after the click and Today opened at 959 ms; Today showed eight burst dots, "Today so far · 3 sessions · 12 min of recorded work." with three new rings, and the Focused today chip at 12 min.
- **Reduced motion:** the same card and no running animations.
- **Axe:** clean on Today and on the phone with the modal open; no overflow; no console errors.

## Production

Merge and deploy; there is no database step.
