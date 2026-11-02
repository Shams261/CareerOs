# WI-122 handoff: one action runner

Date: 2026-11-02. The third "Now" item of the full audit (`output/Silsila-Full-Audit.pdf`, page 4). No migration, no screen changes beyond error wording.

## Why

Eleven features each had their own copy of `perform`, plus about a dozen hand-written catch blocks. They had three faults:

- **Text leaks.** They showed `error.message` for any `Error` without a `code`, so an unexpected `TypeError` or a Prisma validation error could become a message on screen. `src/server/actions.ts` showed any `Error` at all.
- **Swallowed redirects.** `owner()` and `redirect()` inside a `try` would have been caught and shown as "NEXT_REDIRECT" instead of redirecting.
- **Silent failures.** Only three of the eleven logged a failure, and the schedule one logged the error's text. Each kept its own list of routes to revalidate.

## What changed

- **`src/lib/action-state.ts`** holds `ActionState`, the type every action answers with. It is re-exported from `schedule/actions.ts`, so existing imports keep working.
- **`src/lib/action-error.ts`** (pure):
  - `UserError` marks an expected refusal written for the owner.
  - `ownerWords(error)` returns the words of a plain `Error` or a `UserError` only, and never for one carrying a `code` or Next's `digest`.
  - `errorCode` and `withReference` are small helpers.
- **`src/server/action.ts`:**
  - `failure(error, area, fallback)` calls `unstable_rethrow` first, then gives Zod field messages, then the owner's words. Anything else returns "<fallback> Reference 1a2b3c4d." and logs `[<area>] action failed <Class> <code> ref <id>`.
  - `runAction(work, { area, fallback, known, after })`: on success it calls `forgetAll()` and `revalidatePath('/', 'layout')` (every page is per-owner and dynamic). Then `after` runs (the Calendar sync), and its failure never fails a saved change. A feature's own errors go through `known`: `PreviewRequired` for schedule and jobs, `CalendarError` and Zod for calendar.
- **`AiRefusal` and `AiUnavailable`** now extend `UserError`, so their words still reach the owner.
- **Moved onto the runner:**
  - the `perform` wrappers of agent, ai, calendar, dsa, jobs, learning, notes, nudges, review, roadmap and schedule;
  - the catch blocks of agent, prep, deletes, undo, push, close-day, curriculum, today and `src/server/actions.ts`;
  - Rumi's small writes, which hand the model only the owner's words of a refusal and rethrow anything else;
  - Today's and Plan's "Unable to plan this week".
- **Docs:** `security.md`'s log vocabulary, and the forms line in CLAUDE.md.

## Tests

`tests/action-runner.test.ts` (9 cases):

- plain and `UserError` words are kept;
- `TypeError`, `RangeError`, subclasses, coded and digested errors are never shown;
- a `redirect` is rethrown by `failure` and by `runAction`;
- Zod becomes field messages;
- an unexpected error shows a reference and logs no text;
- success revalidates and runs the follow-up;
- a failing follow-up keeps the success;
- `known` answers first.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (147 files, 835 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.
