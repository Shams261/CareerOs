# WI-086 handoff — roadmap card fixes from a bug hunt

Date: 2026-10-30. Branch `fix/wi-086-roadmap-card` from `main` `0a7f613` (WI-085).

**Source.** After WI-085 the owner asked for the bugs to be found. A scripted hunt over the roadmap page in a local production build with the owner's curriculum (`scratchpad/uiux/bugs085.ts`, 24 checks: a bare roadmap, owner-added items without fields, keys, Prev / Next at the ends, Edit, Remove and Undo, Reopen, Back to not started, Asked, the note, the revision view, an archived roadmap, the phone sheet) found four.

**Migration:** none.

## What changed

| Bug                                                                                                                                                 | Fix                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removing the open item left the pane on "Choose an item" and collapsed its section; Undo brought the row back but the pane stayed empty.            | `afterRemoval` (`pane-domain.ts`): when the open item leaves the rows the pane moves to the next shown row, else the previous; `openSections` opens the first section with a row when nothing is named. Applied where the component reconciles new rows. |
| `?show=revision` without a hash (Today's "due for revision" links) opened the Continue item, which the filter hides, instead of the first due item. | `initialItem` takes the Continue item only when the outline shows it.                                                                                                                                                                                    |
| The `c` key did nothing on the task card (it pressed the old `.study-prompt button`).                                                               | The key presses `.pane-tool-main` as well.                                                                                                                                                                                                               |
| Opening a reference or copying the prompt on a not-started item wrote "Started." above the card every time.                                         | The hidden start button has its own quiet form (`.pane-autostart`, not shown); the badge and the outline icon are the only answer.                                                                                                                       |

## Tests

- `tests/roadmap-pane.test.ts`: 15 tests (`afterRemoval`, the collapsed-outline fallback, the hidden Continue item).

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 121 files, 656 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys, axe clean.
- `pnpm docs:check` passes, and so does `git diff --check`.
- The bug hunt on the final build: all 25 checks pass, no console errors.

## Production

Merge and deploy; there is no database step.
