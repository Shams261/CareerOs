# WI-131 handoff: the calendar module split

Date: 2026-11-02. From the full audit's size hotspots (`output/Silsila-Full-Audit.pdf`, page 3): `calendar/service.ts` had five reasons to change in one 1,158-line file. No migration and no behaviour change.

## What changed

`src/features/calendar/service.ts` became six modules, with every line moved, none rewritten:

| Module          | Lines | Holds                                                                                         |
| --------------- | ----: | --------------------------------------------------------------------------------------------- |
| `errors.ts`     |    62 | `CalendarErrorCode`, `CalendarError`, `errorMessages`, `codeOf`, `fatal`                      |
| `core.ts`       |    37 | `CalendarDeps`, `defaultDeps`, `log`, `key`, `getConnection`                                  |
| `oauth.ts`      |   130 | `beginOAuth`, `completeOAuth`, `tokenSource`                                                  |
| `sync.ts`       |   762 | the lease, `syncCalendar`, pull, reconcile, `applyRemote`, conflicts, push, `resolveConflict` |
| `watch.ts`      |    86 | `ensureWatch` (renewal during a sync), `verifyWebhook`                                        |
| `connection.ts` |   108 | `saveExcludedCategories`, `disconnectCalendar`, `calendarOverview`                            |

- `service.ts` is now a 15-line barrel that re-exports exactly the old public surface. The routes, actions, `schedule/page-data.ts` and `tests/calendar-sync.test.ts` import as before.
- Helpers that were private and are now shared between modules are exported from their module, but not from the barrel: `codeOf`, `fatal`, `log`, `key`, `tokenSource`, `Ctx`, `ensureWatch`.
- `sync.ts` imports `watch.ts` at runtime; `watch.ts` imports only the `Ctx` type back, so there is no runtime cycle.

## Gate

prettier, lint, typecheck, the calendar tests (31) and `test:ci` on a fresh database (149 files, 839 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.

## Next

The same split for `src/features/jobs/service.ts` (1,070 lines): applications, rounds and their schedule blocks, prep items, reads, formats.
