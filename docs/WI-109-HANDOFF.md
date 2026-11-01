# WI-109 handoff: reminders that learn

Date: 2026-11-01. The fifth slice of Rumi 3 (`docs/product/rumi2-plan.md`, E5). Migration **D**: `20261105000000_nudge_learning` adds `StudyNudgeSetting.learnTimes` (default on), `learnedAt`, `learnedNote` and `pausedByFeedback` (text array, empty). The owner applies it to the personal database before the merge (`docs/engineering/backup-restore.md`); Render's health check fails a deploy on a schema gap.

## What changed

- **The rule** (`src/features/nudges/learn.ts`, pure, no AI): `learnPart(part, time, lines, zone, quiet)` reads a part's lines from the last `LEARN_LOOK_BACK` (28) days, each with its feedback and the first study start that day within `START_WITHIN` (180) minutes either side of it (`firstStartAfter`). Three answered "Too many" in a row turn the part off (`pause`); otherwise, with at least `LEARN_MIN_LINES` (4) lines answered by a start and a median start at least 30 minutes from the set time, the time moves `LEARN_STEP` (15) minutes toward it, clamped to `PART_WINDOW` (morning 06:00–11:00, afternoon 11:00–16:00, evening 17:00–22:00) and never into quiet hours (`move`). `learnedLine` words a change; `learnDue` keeps it to once in `LEARN_EVERY_DAYS` (7).
- **The run** (`learnNudgeTimes`, `src/features/nudges/learn-service.ts`): with the daily checks in `POST /api/notifications/process`, it reads only owners with learning on whose week is up, takes the parts that are on (the afternoon only while Rumi writes the lines), counts "Too many" only from the last seven days (so a Resume starts afresh), writes the new times or turns a part off and adds it to `pausedByFeedback`, and stamps `learnedAt` and `learnedNote`. Logs `[nudges] learned <count>`.
- **Settings → Study nudges**: "Let the times follow when I start" (`learnTimes`), the last change as a line, and for each part paused by feedback a line with Resume (`resumePartAction` → `resumePart`: on again, the mark cleared, `learnedAt` now). Saving the form with a part switched back on clears its mark (`saveNudgeSetting`). `nudgeContext` reads "Paused by your feedback (…)" when that is why everything is off.

## Tests

`tests/nudges-learn.test.ts` (a move toward later and earlier starts; no move with too few starts, a near start or a far one; the window and quiet hours; the pause after three "Too many"; once a week; the stored run: the morning moved and the evening paused with the note, not again inside the week, Resume, old answers not counting; learning off leaves the times), `tests/nudge-learning-migration.test.ts`.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`; schema: a fresh deploy, `migrate diff --exit-code` 0, the seed twice and `verify-seed.ts`, the upgrade test.

## Next

WI-110 the review summary.
