# WI-129 handoff: the last page reads behind loaders

Date: 2026-11-02. It finishes the audit's "pages and components querying Prisma" item for pages; six components remain. No migration and no visible change.

## What changed

Seven pages still called `db()` after WI-128. Their queries moved unchanged into their features. Each page keeps its markup and calls the new function in place of the query.

| Page                     | Now reads through                                                                                                                      | Where                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `calendar` (Plan)        | `planPage(user, today, days)`: routines, the week's plans after generation, goals, the connection, the generation error, linked rounds | `src/features/schedule/page-data.ts`  |
| `dsa` (Practice)         | `practiceFacts(user, weekStart, now)`                                                                                                  | `src/features/dsa/page-data.ts`       |
| `dsa/[id]`               | `problemName(user, id)` (the tab, memoized) and `problemPage(user, id, from)`, null when not the owner's                               | `src/features/dsa/page-data.ts`       |
| `roadmap/[id]`           | `weekPageReads(user, roadmap)`: links, goals, AI state, revision cards                                                                 | `src/features/roadmap/page-data.ts`   |
| `focus`                  | `runningSession(user)`, `focusBlock(user, blockId)`                                                                                    | `src/features/execution/page-data.ts` |
| `jobs/[id]/prep/[docId]` | `linkedTargets(user, linked)`                                                                                                          | `src/features/prep/page-data.ts`      |
| `learn/topics/[id]`      | `topicPage(user, id)`, `topicSiblings(user, subjectId)`                                                                                | `src/features/learning/page-data.ts`  |

`tests/boundaries.test.ts` gains "pages read through loaders, never the database directly". It fails if any `src/app/**/page.tsx` calls `db()`.

## Still direct

Six feature components query the database themselves. They are streamed parts with their own Suspense, so a loader there is a separate change:

- `calendar/panel.tsx`
- `today/attention.tsx`
- `today/first-run.tsx`
- `execution/running.tsx`
- `jobs/summary.tsx`
- `nudges/off-card.tsx`

## Proof

Computed styles of every element and the page text were taken at 1440 and 390 px, before and after, on Plan (this week and next), Practice, a problem, a roadmap week, Focus on a planned block and a Learn topic (added to the lab database for the check). That is 14 page views with **0 differences**; two old runs agreed exactly. The prep doc page was not exercised (no doc in the lab); its change is two queries moved into one function, checked by the typecheck and the prep tests.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (149 files, 839 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.
