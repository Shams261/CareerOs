# WI-067 handoff — Pause and Resume

Date: 2026-10-28. Branch `feat/wi-067-pause` from `main` `b80bf47` (WI-066).

**Source.** The owner's UAT on production found these problems:

- Start session, then Stop, showed no message.
- The block went to Now as if nothing had happened.
- Its panel listed one "Recorded …" line for every stop: 3, then 4 after another round.
- The panel's two forms (Log time and Edit this day) were long.

I reproduced it on the local production build with three Start → Stop rounds:

- the only message was a "Saved." that left with the launcher;
- the row read Up next;
- the panel listed three "Recorded Oct 28, 22:01–Oct 28, 22:01 · under a minute" lines.

**Cause.** Stop ended the session and set the block back to `PLANNED`. Nothing on screen read "paused" or showed the time so far, and each Start opened a new session record.

**Migration:** none. Each Start still records its own session (the parts are the record); only the reading changes.

## What changed

| Part          | Where                                                                                                       | What                                                                                                                                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paused state  | `src/features/schedule/row.ts`                                                                              | `blockResolution` returns `paused` for a block with sessions, no session running and its slot still open. Its text is "Paused"; `rowMeta` reads "9 min so far · Until 12:30"; `recordedText`.                                                                                     |
| Grouping      | `src/features/today/domain.ts`                                                                              | A paused planned block groups as Now, like a running one. A completed one stays Earlier.                                                                                                                                                                                          |
| Close the Day | `src/features/close-day/domain.ts`                                                                          | A paused block is `recorded`: Done or Let go, never moved to tomorrow.                                                                                                                                                                                                            |
| Launcher      | `src/features/today/launcher.tsx`                                                                           | A paused block's eyebrow reads "Paused · X so far", with Resume (primary) and Complete.                                                                                                                                                                                           |
| Buttons       | `src/features/schedule/forms.tsx`, `src/features/execution/running.tsx`, `src/features/execution/focus.tsx` | Stop reads Pause. Start reads Resume on a paused block (`resume`). The launcher's results go to the `blocks` outlet.                                                                                                                                                              |
| Message       | `src/features/schedule/actions.ts`                                                                          | Pause returns "Paused · X so far. Resume when you are ready." (`pausedMessage`, summing the block's ended sessions).                                                                                                                                                              |
| Panel         | `src/features/today/agenda.tsx`, `globals.css`                                                              | One total, "Recorded 9 min · 2 parts", with the parts as short lines; the date shows only when a part is on another day.                                                                                                                                                          |
| Short forms   | `src/features/schedule/time-length.tsx`, `forms.tsx`                                                        | `TimeLengthFields`: start, end and length chips. **Log time:** the dates and a note sit under More. **Edit this day:** title, then times; kind, goal, priority, notes and dates sit under More, and "Allow overlap" stays in view. `CommonFields` is gone, since nothing used it. |
| Words         | services                                                                                                    | "Stop the running session…" now reads "Pause the running session…", and "Another session is running. Pause or complete it first."                                                                                                                                                 |

## Tests

**New:** `tests/pause-domain.test.ts` covers:

- paused, its text, its meta line, and past the slot (needs update);
- paused grouped as Now, and completed staying Earlier;
- Close the Day treating paused as recorded.

**Updated:**

| File                                                                      | Change                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `tests/close-day-database.test.ts` and `tests/execution-database.test.ts` | The new wording ("Pause the running session").               |
| `tests/agent-database.test.ts`                                            | Rumi reads the 20-minute block with its slot open as Paused. |

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci`: 113 files, 609 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification

Local production build, Playwright, the same three Start → Pause rounds:

- **Launcher:** "PAUSED · UNDER A MINUTE SO FAR", with Complete and Resume.
- **Row:** "Paused · under a minute so far · Until 22:36".
- **Message:** "Paused · under a minute so far. Resume when you are ready."
- **Panel:** "Recorded under a minute · 3 parts", then the short Log time and Edit forms.

The screenshot was checked as well.

## Production

Merge and deploy; there is no database step.
