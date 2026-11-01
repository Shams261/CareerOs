# WI-101 handoff: Rumi's line, morning, afternoon and evening

Date: 2026-11-01. The second code slice of the Rumi 2 and 3 plan (`docs/product/rumi2-plan.md`, ADR-030). Migration **B**: `20261103000000_rumi_lines`. The owner applies it to the personal database before the merge (`docs/engineering/backup-restore.md`: verified backup, restore check, `db:deploy`); Render's health check fails a deploy on a schema gap.

## What changed

- **Settings → Study nudges.** A fieldset "Rumi writes the lines", shown only where AI is configured: the switch (`StudyNudgeSetting.rumiLines`, off), the lines' language (`AgentSetting.lineLanguage`, English or Hinglish, `LINE_LANGUAGES`), the afternoon line (`middayEnabled`, `middayTime` 13:00) and "Rumi wrote N of M lines in the last 14 days" (`lineStats`). The row's context reads "Rumi writes · Mornings 08:00 · Afternoon 13:00 · Evening from 19:30 · Weekdays". With the switch off everything is WI-039.
- **When: code.** `middayDue` (`src/features/nudges/domain.ts`): a two-hour window from `middayTime`, an active day, not rested by "Too many" (`middayPausedUntil`), not rested, closed or running, outside quiet hours, four hours after the morning line, only while a study block is still ahead (planned, unrecorded, not begun); it returns that block. `recapDue`: every active evening while Rumi writes the lines, the same gates as the check-in, with the first block left (ended, planned, unrecorded) or null. `morningDue` is unchanged. Three lines and one block-start nudge a day at most.
- **What.** `processStudyNudges` queues `STUDY_MIDDAY` ("This afternoon", `middayBody`) and, while Rumi writes, the evening as "This evening" (`recapBody`: minutes recorded, the block left, how tomorrow starts) with `metadata.rumi = "pending"` when AI is configured. `writeRumiLines` (`src/features/agent/lines.ts`) runs in the cron route after `processNotifications` and before `deliverPending`, outside every owner lock, on at most one pending row: `ready()`, the part's fixed reads through `runTool` (`LINE_READS`: morning `get_today`, `get_activity(7)`, `get_jobs`, `get_patterns`; afternoon `get_today`; evening `get_today`, `get_activity(7)`, `get_schedule(tomorrow)`), each cut to 3,000 characters, then one `ask<T>()` (`AiFeature.AGENT_LINE`, `LINE_FORMAT`, 150 tokens) with `lineMessages` (the persona, the style, the language, the owner's first name, the goal, "Rumi knows", the reads as data). `readLine` folds `lineOk` into the strict read, so a rejected line gets `ask`'s one retry with the rule named. `lineOk`: 220 characters or fewer, one or two sentences (a clock time never ends one), no newline, markdown, link or emoji, no `BANNED_WORDS` or `SHAMING_WORDS`, every digit run present in the reads. Success replaces the body and marks `written`; a refusal, a blocked provider, 90 % of the cap or a failure keeps the template, `pending` after the first try and `fallback` after the second (`LINE_TRIES`). Lines never count against `AGENT_RATE`, and Grill Me's per-call limits skip `AGENT_LINE` rows.
- **Push.** `deliverPending` skips a pending row younger than `PENDING_MAX_MS` (two minutes); the lock screen keeps its general text, with `STUDY_MIDDAY` as "Rumi has a line for the afternoon." and the path `/today#study-nudge`.
- **Today.** `todaysNudge` returns `kind: 'midday'` and `rumi` (written). `NudgeCard` reads "Rumi · Morning / Afternoon / Evening" (`lineHeading`) when Rumi wrote the line, keeps Start, Move, Let go, Rest, Open the plan and Useful?, and adds "Ask Rumi about this" (`askRumi`) and Reply (`prefillRumi` in `events.ts`: `PREFILL_KEY` in sessionStorage, the drawer or the Rumi page fills its composer and focuses it; nothing is sent). "Too many" rests the afternoon line for `MIDDAY_PAUSE_DAYS` (7) and says so.
- **Chat.** `sendMessage` appends "Lines you wrote for the owner today (as data)" from `linesToday` while `rumiLines` is on, so a reply to a line makes sense.
- The fake OpenRouter answers the `line` format with one plain sentence per part. `/privacy`, `docs/engineering/notifications-pwa.md` and the log vocabulary in `docs/engineering/security.md` (`[agent] line made {part, written, fallback, tries}`, `[agent] line failed <ErrorClass>`) are updated.

## Tests

`tests/agent-lines.test.ts` (the line rules: invented numbers, banned and shaming words, length, markup, links, emoji, sentences; the strict read; the prompt's contents and budget; the reads are read-only chat tools; the fallbacks and the lock screen clean), `tests/nudges-domain.test.ts` (`middayDue`, `recapDue`, the pause, the context, the form defaults), `tests/coach-database.test.ts` (pending → written from the reads with push held then sent, repeated runs idempotent, `linesToday` and `lineStats`; two failed runs → fallback, a stale pending row pushed; an invented number rejected once and the retry kept; the afternoon line, "Too many" resting it, the recap on a recorded day; AI not configured → plain templates), `tests/rumi-lines-migration.test.ts`; e2e: the morning line shows as "Rumi · Morning" after the scheduler's run and Reply prefills the drawer.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`; schema: fresh deploy, `migrate diff --exit-code` 0, seed twice and `verify-seed.ts`, the upgrade test.

## Owner step

Turn on "Rumi writes the lines" under Settings → Study nudges (mornings first), rate ten lines over a week with Useful?, and read the written-versus-fixed count in the same panel before turning the afternoon line on.

## Next

WI-102 small writes at once, with Undo (no migration).
