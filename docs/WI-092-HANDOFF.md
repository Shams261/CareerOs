# WI-092 handoff — no more For today picks

Date: 2026-10-30. Branch `feat/wi-092-no-for-today` from `main` `8c08a5c` (WI-091).

**Source.** Using Practice after WI-091 the owner asked where the "For today" rows came from and chose to remove them from both places they were still shown (Practice and Today). They came from WI-059: three picks a day (the oldest due revision, what the next interview tests, one problem in curriculum order) with a reason each and Start 20 min, shared by the Roadmap overview (gone since WI-088), Practice and Today's free launcher.

**Migration:** none.

## What changed

| Where                | Was                                                                                                                                           | Now                                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Practice (`/dsa`)    | A "For today" card of up to three picks under the facts, and the head's Next problem button only when there were none.                        | The head's primary is Next problem (or Revise · title) whenever there is a next problem. The card is gone.                                                                                                                                                                            |
| Today's launcher     | With nothing current or next and the day still open: "Free now" / "Start from here", the first pick, Start 20 min, Open it first.             | "Update earlier blocks" (blocks without a decision) or "That is the plan for today" with Add a block, as before WI-059. On a quiet yesterday (planned, none recorded) "Let go of yesterday's blocks" sits in the launcher's next line; the facts line above already states the count. |
| Today, empty account | "or try a 20-minute session" under Plan my first focus, starting the first pick.                                                              | Plan my first focus alone.                                                                                                                                                                                                                                                            |
| Code                 | `src/features/for-today/` (domain, service, card, actions), `freePick` in `today/domain.ts`, the `for-today:` snapshot, `.for-today*` styles. | Removed. `letGoDay` moved to `src/features/today/let-go.ts`, `letGoDayAction` to `src/features/today/actions.ts`; `.launcher-next > .launcher-letgo:first-child` drops the leading margin. `curriculumOrder` stays in `dsa/domain.ts` (tested, used by nothing else now).             |

## Tests

Three test files covered only the removed code and go with it, at the owner's request (a feature removal, not a test weakened to pass): `tests/today-pick.test.ts` (`freePick`), `tests/start-pick-database.test.ts` (`startPick` over the day's blocks), and the "For today" block of `tests/for-today-domain.test.ts`, whose other two blocks (the facts line, the routine templates) continue as `tests/today-facts.test.ts`.

## Gate

- `pnpm typecheck`, ESLint and Prettier clean on the changed files.
- `pnpm test:ci` on a fresh disposable database: 120 files, 661 tests.
- `pnpm build`, `pnpm test:e2e`, `pnpm test:e2e:safari`, `pnpm docs:check`, `git diff --check`.

## Docs

CHANGELOG, CLAUDE.md (latest work item, handoff pointer), ADR-027's empty-account line notes the removal.
