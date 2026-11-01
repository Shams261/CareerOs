# WI-106 handoff: the pattern coach

Date: 2026-11-01. The second slice of Rumi 3 (`docs/product/rumi2-plan.md`, E2). Migration **C**: `20261104000000_noticed_coach_kinds`, which only replaces the `NoticedAnswer_kind_known` check so it also accepts `stuck` and `cold` (the schema file is unchanged; Prisma does not model checks). The owner applies it to the personal database before the merge (`docs/engineering/backup-restore.md`); without it, answering a coach card would fail and Render's health check would fail the deploy.

## What changed

- **Two kinds in Rumi noticed** (`src/features/noticed/domain.ts`, pure, no AI): `stuckCards` names a Practice topic attempted on `STUCK_DAYS` (4) or more of the last `STUCK_WINDOW` (7) days whose latest confidence is not above its first and not Solid, counting the problems whose latest attempt is still Shaky; and a roadmap item `IN_PROGRESS` unchanged for four days or more. `coldCards` names a revision step due today or tomorrow on a topic with no attempt for four days or more (one card per topic). Order: interviews, stuck, cold, then the older kinds; two cards a day at most; every line passes `cleanCopy`, which now reads the second action too.
- **Actions**: a stuck topic offers Next topic (the next problem outside it, from `nextProblemFor` over the curriculum order, computed in `noticedFor`) or Open Practice, and a second action, `alt`: Mixed set (`/dsa/drill?topics=` the last four topics; the pattern quiz uses them when they hold a deck, else its usual set) or, with one topic only, Ask Rumi why (a chat question: why the pattern is hard and one hint, no solution). Stuck cards show Keep going in place of Dismiss (`keepGoing`: acted, rests `SNOOZE.acted` = 3 days). A cold card offers Revise.
- **Loading** (`noticedFor`, still one memoized snapshot): the last 28 days' attempts with their topic (hidden and test-named problems left out), problems with a revision step due today or tomorrow, items in progress (archived roadmaps and test names left out) and `dsaSnapshot` for the next problems.
- **The plan's optional Rumi line** on the card (an `AGENT_LINE` call when Rumi writes the lines) would need a stored line and so more schema; it became Ask Rumi why, the owner's own question in the chat, which costs nothing until pressed.

## Tests

`tests/noticed-domain.test.ts` (a stuck topic with its actions, silence when confidence rose or on fewer days or once hidden, an item in progress and a cold revision, Ask Rumi why with one topic), `tests/noticed-database.test.ts` (the coach from stored attempts, Next topic, Keep going resting three days), `tests/noticed-coach-migration.test.ts` (existing answers kept, the new kinds accepted, unknown kinds still refused).

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`; schema: a fresh deploy, `migrate diff --exit-code` 0, the seed twice and `verify-seed.ts`, the upgrade test.

## Next

WI-107 the week draft.
