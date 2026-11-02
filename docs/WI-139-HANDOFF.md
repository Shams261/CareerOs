# WI-139 handoff: code hardening

Date: 2026-11-02. This is the second of the three work items from the re-check of `output/Silsila-Full-Audit.pdf` (WI-138 ops and truth, WI-139 code hardening, WI-140 calmer UX). No migration, and nothing on screen changes.

## What changed

- **Stored JSON is read, not cast.**
  - **Prep docs.** `storedPrepDoc` (`src/features/prep/domain.ts`) replaces the five `row.content as unknown as PrepDoc` in `prep/service.ts`, `prep/mock.ts` and `prep/plan.ts`. It reads every part by its stored shape. A part that no longer fits reads as empty, the other parts stay, and anything that is not a doc reads as an empty doc. A page never breaks on an old or hand-edited row.
  - **Curriculum bundle.** `readBundle` (`src/features/curriculum/bundle.ts`, a Zod schema that `satisfies` the `Bundle` type) replaces the cast in `publishedBundle` and the `JSON.parse(…) as Bundle` in `scripts/publish-curriculum.ts` and `scripts/import-roadmap.ts`. A broken file is refused with the path of its first problem. A stored payload that no longer reads counts as no published bundle, logged as `[curriculum] stored bundle unreadable <path>`.
  - Tests: `tests/stored-json.test.ts`.
- **More actions through the runner (WI-122).** `nameAction`, `dayPrintAction`, `answerNoticedAction` and `signOutOthersAction` now use `runAction`.
  - They were already safe from raw messages. Now an unexpected error gets a reference, and every page refreshes.
  - Three files keep their own way, each named with its reason in `tests/boundaries.test.ts`:
    - `theme-actions.ts` and `setup/actions.ts`: a browser cookie, no record and no message;
    - `listen/actions.ts`: the budget beside the words; only its own AI refusals speak.
  - A new server-action file without the runner fails that test.
- **Features that import each other.**
  - There were 16 pairs at value-import level. A client's import of a server action counts as a reference, not a dependency.
  - Three are cut:
    - `schedule → today`: `PLAN_LINES` and `planLine` moved to `src/features/schedule/plan-lines.ts`; Today re-exports them for its copy check.
    - `review → today`: `UtilityMenu`, the header ⋯ shared by every page, moved to `src/components/utility-menu.tsx`.
    - `agent → undo`: `undoWriteAction` moved to `src/features/undo/actions.ts` beside `undoAction`.
  - The 13 left are listed in `tests/boundaries.test.ts`. The test fails on a new pair, and on a pair that is gone until it is struck from the list, so the list only shrinks. Most of the 13 are a core feature and its page or Rumi.
- **`roadmap/week-items.tsx` (922 lines) split by moving code, unchanged:**
  - `week-items.tsx` (397): the list, row state, keys and the hash;
  - `item-body.tsx` (473): one item as a task card;
  - `study-hint.tsx` (48): the first-time hint.
- **One way to write things.**
  - The four local `plural` helpers (Jobs page, attention, Day Print, Look Back) use `plural` from `src/lib/copy.ts`.
  - Every bare `formatInTimeZone(…, 'HH:mm')` is now `hhmm`: schedule editing and forms, calendar, jobs domain and forms. Formats with a date (`'MMM d, HH:mm'`) keep their pattern.
- **No non-null `!` in `agent/requests.ts`** (14 before):
  - `REQUEST_UNDO` is `as const satisfies Record<RequestKind, string | null>`, so each kind's undo is a known string.
  - A move card reads its day and times through `requestArgs.move_block` and refuses when they are missing.
- **Reports in CI that never fail the build.**
  - Quality runs `pnpm test:ci --coverage` (v8, a text summary of `src/`; `scripts/test-ci.mjs` passes arguments on to Vitest) and `knip --no-exit-code` (`knip.json`).
  - knip's first report: no unused file or dependency; 136 unused exports and 28 unused exported types. That is a list to work down, not a gate.
  - Coverage's first summary (all 858 tests on a fresh database): statements 53.6 %, branches 44.5 %, functions 47.9 %, lines 54.1 % of `src/`. Pages and client components are covered by the browser journeys, not by these numbers.
  - New dev dependencies, pinned exactly and older than two weeks: `knip` 6.42.1 and `@vitest/coverage-v8` 5.0.5 (it matches Vitest 5.0.5).

## Not done, and why

- **The `TimeBlock` index** (`@@index([dailyPlanId, plannedStart])`). It needs a migration that the owner applies to the personal database before the merge. The plan said it could wait while the data is small, and it can.
- **`z.iso.date()` to a regex.** One use is left (`schedule/domain.ts`). The audit's reason was Zod reaching the browser, which WI-123 settled. `z.iso.date()` also rejects 2026-02-30, which a regex would let through.
- **The 136 unused exports.** Reported, not removed. Removing them is mechanical but touches many files; it can go with the pages as they are worked on.
- **The other 13 feature pairs.** Frozen, not cut.

## Gate

prettier, lint, typecheck, `test:ci --coverage` on a fresh database, build, `test:e2e` and `test:e2e:safari`, docs:check, `git diff --check`. Then the branch is pushed and its Quality run is green before the merge. Results at merge.
