# WI-110 handoff: the review summary

Date: 2026-11-01. The last slice of Rumi 3 (`docs/product/rumi2-plan.md`, E8), and with it the whole Rumi 2 and 3 plan. No migration.

## What changed

- **Where**: Weekly review → The week, above The week in short, only while "Rumi writes the lines" is on and AI is configured (`summaryOn`, read with the step's other reads). A button "Sum up the week with Rumi"; nothing is written on page view.
- **The call** (`weekSummary`, `src/features/agent/summary.ts`): one `ask<string>()` (`AGENT_LINE`, `LINE_FORMAT` at 220 tokens, `perFeatureDay` `SUMMARY_PER_DAY` = 10 shared with the lines) with the persona, the style, the line language, the rules and the reads as data: `get_schedule` for the week and, when the week is the current one, `get_activity(7)`, each without ids (`readText`). The answer is read by `readLine(reads, SUMMARY_MAX)`: 300 characters, one or two sentences, plain text, no banned or shaming word, every number present in the reads; a rejected answer gets `ask`'s one retry with the rule named.
- **Keep and Remove** (`WeekSummary`, `summary-card.tsx`): the text is editable; Keep (`keepSummaryAction` → `keepWeekSummary` in `src/features/review/service.ts`) adds it to the week's What went well? (`biggestWin`) as a draft, after the owner's own words when there are some, cut to 1,000 characters; nothing else in the review changes and the review stays a draft. Remove drops the box.
- `lineOk(text, reads, max = LINE_MAX)` and `readLine(reads, max)` take a limit. The fake OpenRouter answers the week part. `/privacy` and the log vocabulary updated.

## Tests

`tests/agent-summary.test.ts` (the longer limit with the same checks; off until Rumi writes the lines, with no call; an invented number refused and the retry kept, the week's schedule sent, nothing stored before Keep; Keep after the owner's own words, the review still a draft).

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`.

## Next

The Rumi 2 and 3 plan is built. Two weeks of UAT with the plan's measures, then the budget option (ADR-022 stays until then).
