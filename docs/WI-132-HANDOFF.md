# WI-132 handoff: the jobs module split

Date: 2026-11-02. From the full audit's size hotspots (`output/Silsila-Full-Audit.pdf`, page 3). The same treatment WI-131 gave the calendar. No migration and no behaviour change.

## What changed

`src/features/jobs/service.ts` (1,070 lines) became seven modules. Every declaration moved with its comment, none rewritten.

| Module               | Lines | Holds                                                                                                                                         |
| -------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `owned.ts`           |    42 | `Tx`, `DUPLICATE_TOKEN`, `ownedApplication`, `ownedRound`, `replayed`                                                                         |
| `applications.ts`    |   318 | create, details, `moveStage`/`changeStage`, the next action, notes, job reminders                                                             |
| `round-blocks.ts`    |   145 | the interview's schedule block follows its round: `renameScheduleBlock`, `settleScheduleBlock`, `moveScheduleBlock`, `addInterviewToSchedule` |
| `rounds.ts`          |   212 | schedule, details, reschedule, `recordRoundResult`                                                                                            |
| `prep-items.ts`      |    70 | `validateLinks`, `addPrepItem`, `setPrepItemDone`                                                                                             |
| `reads.ts`           |   238 | `jobSnapshot`, `applicationDetail`, `todaysInterviews`, `jobTodaySummary`, `funnelSnapshot` (memoized)                                        |
| `formats-service.ts` |   109 | `saveFormats`, `formatItems`, `loopPractice`                                                                                                  |

- `service.ts` is a barrel of exactly the old public exports, so the 15 importers (pages, actions, Rumi, roadmap, today, tests) are unchanged.
- The runtime imports run one way, with no cycle: `rounds` → `applications` → `round-blocks` → `owned`.
- The split was done by a script that moves each top-level declaration with its comment, then exports and imports whatever the typecheck reports missing (`scratchpad wi124/split2.py`). The same script can split the next large service.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (149 files, 839 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.
