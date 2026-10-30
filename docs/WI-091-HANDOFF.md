# WI-091 handoff — Practice fixes from the audit

Date: 2026-10-30. Branch `fix/wi-091-practice-audit` from `main` `6450a93` (WI-090).

**Source.** After the roadmap was closed out the owner asked for the same loop on Practice: a scripted audit (`scratchpad/uiux/audit-practice.ts`, 36 checks) and a PDF (`output/Silsila-Practice-Audit.pdf`, not committed) with six bugs and six suggestions. The owner approved all twelve.

**Migration:** `20261031000000_problem_url_optional`. The `problem_url_http` check on `DsaProblem` now allows an empty `problemUrl` beside an http(s) link; the column stays `NOT NULL` and the Prisma schema is unchanged (check constraints are not modelled, so `prisma migrate diff` is clean). Production: apply with `pnpm db:deploy` against the Supabase URL after a verified backup (`docs/engineering/backup-restore.md`); until it is applied, the new build runs fine except that adding a problem without a link fails with a database error, so apply the migration before or right after the deploy.

## What changed

| #   | Was                                                                                                                        | Now                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Make current refused every imported topic (all Not started) with "Set a current topic to Learning, …".                     | `setCurrentTopic` moves a Not started topic to Learning in the same write; Paused and Completed keep the refusal.                                                                                                    |
| P2  | The problem page's fact read "Next revision Oct 28" for a revision two days overdue.                                       | The fact is "Revision": "Overdue since Oct 28" or "Due today" in amber, else the day, else "Not scheduled"; "(set by hand)" stays. Read through `learningState`, the list's own rule.                                |
| P3  | The Topics panel counted "6 Green · 5 Yellow · 6 Red".                                                                     | "6 Solid · 5 Okay · 6 Shaky" through `confidenceWord`.                                                                                                                                                               |
| P4  | After Save attempt the confidence select still showed the last answer (the native reset skipped the disabled placeholder). | The form remounts after a save (`AttemptForm` keeps a round and a fresh uuid per round, so one submission still deduplicates and a new attempt never does).                                                          |
| P5  | On a phone the head's three buttons took three rows.                                                                       | Topics and Pattern quiz sit in More (`UtilityMenu`), Add a problem stays; the menu's styles now cover `.page-head` as well as `.today-head`.                                                                         |
| P6  | "Attempts 1 · revision stage 1".                                                                                           | "Attempts 1".                                                                                                                                                                                                        |
| S1  | The attempt form: three full-width radio rows, two selects, two textareas, about 1,000 px.                                 | Three lines: "How did it go?" as chips (`.choice-group.is-chips`), Confidence and Minutes on one line (`.attempt-line`), "+ What did you miss" and "+ Note" behind links; about 620 px on a phone, from about 1,000. |
| S2  | Record an attempt came before Study on every problem page.                                                                 | From the roadmap (`?from=`) Study leads and the form follows; from the list the form leads.                                                                                                                          |
| S3  | Add a problem needed a title, a platform, a URL and a topic.                                                               | A title (and the topic, which defaults to the current one): Platform defaults to Other, the URL is optional and validated when given (`saveProblem`, the migration).                                                 |
| S4  | Only the title text opened a problem; a 14 px icon after it opened the platform.                                           | The title's link reaches over the whole row (`.problem-line .problem-title::after`); "LeetCode ↗" sits in a fourth column at the row's end (`.problem-cell-open`), under the status on a phone.                      |
| S5  | The quiz's end listed the pattern pairs mixed up.                                                                          | And the problems picked wrong, each a link to its page (`.drill-missed`).                                                                                                                                            |
| S6  | Watch it run showed Container With Most Water on Valid Palindrome without saying so.                                       | Its first line: "A sample of the pattern, not this problem."                                                                                                                                                         |

## Tests

- `tests/dsa-database.test.ts`: two tests added (Make current starts a Not started topic and still refuses a paused one; a problem saves without a platform or a link, and a `javascript:` link is refused).
- `e2e/journeys.spec.ts`: a new Practice journey (the first topic, a problem with a title alone, a chip setting the confidence, Save, the fresh form, axe, the phone).

## Checks

- `scratchpad/uiux/check091.ts` on the final build: the head's More, Make current, the Topics counts, the row as a link with the platform link at its end, a title-only problem, the three-line form and its reset, the Revision fact, Study before the form from the roadmap, the sample line, the quiz's missed list, axe, the phone head on one row.
- `scratchpad/uiux/audit-practice.ts` re-run with the new expectations: every check passes.

## Gate

- `pnpm typecheck` and ESLint clean; Prettier clean on changed files.
- `pnpm test:ci` on a fresh disposable database; `pnpm build`; `pnpm test:e2e` and `pnpm test:e2e:safari` (8 journeys); `pnpm docs:check`; `git diff --check`.
- Schema gate: clean `db:deploy` on a fresh database, the upgrade from the previous migration, `prisma migrate diff --exit-code`, the seed twice.

## Production

`/api/health` answers `schema: "migration-pending"` (and `ok: false`) from the moment the new build runs until the migration is applied, since `LATEST_MIGRATION` in `src/server/health.ts` now names it; the uptime check reads that line.

1. Backup and verify (`pnpm db:backup`, `pnpm db:restore:verify`).
2. `pnpm db:deploy` against the Supabase URL.
3. Merge and deploy.
