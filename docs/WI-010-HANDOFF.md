# WI-010 handoff — the week at a glance, light motion, notes to self

Branch `feat/wi-010-review-motion-capture` on `main` after PR #15. The last three items of the daily-use plan agreed on 2026-10-21, after WI-009 shipped.

## 1. Outcome

The weekly review opens with a picture of the week, the interface moves just enough to feel alive, and a thought can be captured from any page without leaving it. One migration (`QuickNote`). No streaks, scores or counters.

## 2. Changes

| Area          | Change                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Week chart    | `weekBounds` gains `edges` (eight local-midnight instants). `scheduleWeek` returns `planned` and `actual` minutes per day, clipped to each owner-local day (tested with an overnight session). Review step one draws seven columns with an outlined planned bar and a filled recorded bar, today tinted, a text equivalent in `aria-label` and a title per column. |
| Motion        | `@media (prefers-reduced-motion: no-preference)` only: cards, the setup card, the Now/Next card and stat tiles rise in (240 ms, stats staggered 40 ms), disclosure panels rise in, buttons scale on press, bars animate height, a breathing dot precedes the live timer. Under reduced motion nothing animates.                                                    |
| Notes to self | `QuickNote` (body up to 500, `doneAt`), migration `20261021162842_quick_notes`, `LATEST_MIGRATION` bumped, export gains `quickNotes`. `CaptureForm` in the shell under the running-session panel (Enter saves, "Saved to Today."). Today lists open notes oldest first with Done and Remove. `src/features/notes/{service,actions,forms}`.                         |
| Tests         | `tests/review-domain.test.ts` (+1 per-day minutes), `tests/notes-database.test.ts` (capture, order, ownership, done, remove), `tests/notes-migration.test.ts` (upgrade from `roadmap_and_goals`, cascade on user delete). The roadmap upgrade test now checks that its migration exists rather than being the newest.                                              |

## 3. Verification

Local fake-Google loop in the desktop browser pane: a note typed in the sidebar and saved with Enter appeared on Today under "Notes to self"; review step one rendered the chart with the week's recorded session; no console errors. Motion checked visually at desktop width.

## 4. Commands and results

| Check                                                                                                | Result                           |
| ---------------------------------------------------------------------------------------------------- | -------------------------------- |
| `prisma format`, `db:generate`, `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `git diff --check` | Passed                           |
| Clean `db:deploy` (12 migrations), drift check, seed idempotency (28 tables)                         | Applied, no difference, verified |
| `pnpm test:ci`                                                                                       | 237 passed in 33 files (+3)      |
| `pnpm build`                                                                                         | Passed                           |

## 5. Deploy note

After merge: `pnpm db:backup` (libpq recipe), then `pnpm db:deploy` against Supabase. Until the migration runs the deployed Today page errors on the notes query and health reports the schema as pending.
