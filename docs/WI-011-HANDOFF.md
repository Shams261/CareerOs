# WI-011 handoff — UX pass: undo, summaries, phone navigation

Branch `feat/wi-011-ux-pass` on `main` after PR #16. Items 1 to 5 of the UX list and 8 to 10 of the UI list from the 2026-10-21 product analysis.

## 1. Outcome

In progress. This file is updated per item.

## 2. Changes

| Item | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Undo | `ActionState.undo` carries `{ kind, payload }`. Actions that remove or set aside something return it: Skip and Cancel block (`block-reset`), Remove note (`restore-note`), Remove roadmap item (`restore-roadmap-item`, with status, marks, notes and links), Remove priority (`restore-priority`). `ActionForm` shows an **Undo** link beside the success message for eight seconds; it calls `undoAction`, which runs `restore()` in `src/features/undo/service.ts` under the signed-in owner, refreshes the page and reports "Note restored." and the like. No soft deletes and no schema change: an undo re-creates the record from the payload, and links are kept only when they still point at the owner's own records. Tested in `tests/undo-database.test.ts` (note, roadmap item with marks and ownership, skipped block, unknown kind). |

## 3. Verification

Local fake-Google loop: Skip on Today showed "Skipped. Undo"; Undo returned the block to Upcoming with "Block restored." beside the button; no console errors.

## 4. Commands and results

Per item: `pnpm lint`, `pnpm typecheck`, the touched database tests on a disposable database. Full gate before the PR.
