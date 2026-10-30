# WI-089 handoff — roadmap fixes from the audit

Date: 2026-10-30. Branch `fix/wi-089-roadmap-audit` from `main` `2c9831a` (WI-088).

**Source.** After WI-088 went live the owner asked for a full critique: every feature of the Roadmap page and the week page tested, the bugs found, improvements proposed (`output/Silsila-Roadmap-Audit-WI-088.pdf`, not committed; the script is `scratchpad/uiux/audit088.ts`). The audit ran 53 checks on a local build with the owner's curriculum (1,440 and 390 px, light and dark, Large text) and found five bugs; the owner approved all five, suggestions S1 and S2, and added one they had seen themselves: the foot's buttons overlapping and the ⋯ menu disappearing. That one turned out to be two: the `.item-foot` flex rule had left with the WI-084 CSS block, and `.week-item { overflow: hidden }` clipped the menu. A seventh came up while verifying: Escape on an open ⋯ menu also closed the row.

**Migration:** none. The hand-closed band is remembered as `none` in the same `localStorage` key as before.

## What changed

| #   | Was                                                                                                                                                                                                                                                  | Now                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | After Mark done the "Done. Revision in 7 days." line sat above the list, out of view, and cleared after 3 s; Done and Revised had no Undo (the audit's "Done · Undo" was wrong about that: only Remove, Reopen and Back to not started carried one). | The `roadmap-items` outlet floats at the foot of the screen (`.form-success.feedback-float`, above the phone bar at 390 px), in view wherever the open row sits; Done and Revised now carry the same `restore-roadmap-state` Undo as Reopen, so the line stays 8 s with Undo. |
| B2  | Edit → another week: the page silently showed a different week under the old address; the item was not followed.                                                                                                                                     | `ItemForm` passes `onPending`/`onSettled` through; `ItemBody.followMove` pushes `?section=<new>#item-<id>` when the saved section differs, so the address, title and open row agree.                                                                                          |
| B3  | Every week's tab read "Roadmap · Silsila".                                                                                                                                                                                                           | `generateMetadata`: "Week 1 · Foundations: request → response · Backend engineering"; the roadmap's name alone when no week is named.                                                                                                                                         |
| B4  | On a phone More sat on its own line under the back link.                                                                                                                                                                                             | The back link and More share one row; the filters, when shown, take the next row at full width (`.today-head-actions { display: contents }` under 700 px).                                                                                                                    |
| B5  | "6 shown, 184 more in other weeks" was a number with nowhere to go.                                                                                                                                                                                  | The count is a link to the next week with a match (`nextSectionWithMatch`, wrapping round), keeping Show and the search.                                                                                                                                                      |
| B6  | Mark done, Asked in an interview and ⋯ touched or overlapped (no gap; `margin-left: -4px`), the owner's own finding.                                                                                                                                 | `.item-foot` is a wrapping flex row again, 12 px between buttons, a divider above; the ⋯ margin is 0.                                                                                                                                                                         |
| B7  | The ⋯ menu was cut off by its row (`overflow: hidden`), the second half of the owner's finding.                                                                                                                                                      | The row no longer clips; the menu opens over the next row.                                                                                                                                                                                                                    |
| B8  | Escape on an open ⋯ menu closed the menu and the open row.                                                                                                                                                                                           | `PageShortcuts` returns while a ⋯ or More toggle is `aria-expanded="true"`; the menu's own Escape runs alone.                                                                                                                                                                 |
| S1  | Every band closed on a first visit.                                                                                                                                                                                                                  | `RoadmapBands defaultOpen`: the roadmap holding the Continue item (`continueTarget`) opens when nothing is remembered; closing a band by hand is remembered as `none`.                                                                                                        |
| S2  | ← / → did nothing on a week page.                                                                                                                                                                                                                    | `PageShortcuts prev`/`next` carry the neighbouring weeks' links, as Today walks days.                                                                                                                                                                                         |

## Seen, not changed

- Sections keep the order their earliest item was added in (`sectionSummary`, WI-012). Editing an old item into a later section can move that section ahead in the band and in the week nav (Week 3 before Week 2 after moving a Week 1 item into it). Rare with the curriculum; worth an explicit section order if the owner starts rearranging weeks.

## Tests

- `tests/roadmap-week-items.test.ts`: 15 tests (`nextSectionWithMatch` is new).
- `e2e/journeys.spec.ts`: the roadmap journey also expects the Undo in the viewport after Mark done and the tab title "Building blocks · System design".

## Checks

- `scratchpad/uiux/check089.ts` on the final build: S1 on a first visit and after a hand close, the tab title, 12 px between the foot's buttons, the ⋯ menu fully visible, the Undo in view after Mark done (desktop, and above the phone bar), ← / →, the matches link opening the next week with the filter kept, an item followed to its new week and back, the phone header on one row with the filters under it, no overflow, no console errors.
- `scratchpad/uiux/audit088.ts` re-run with S1 in mind: every check passes.

## Gate

- `pnpm typecheck` and ESLint clean; Prettier clean on changed files (`pnpm lint` exits 1 only on the untracked `docs/audit`, as before).
- `pnpm test:ci` on a fresh disposable database; `pnpm build`; `pnpm test:e2e` and `pnpm test:e2e:safari` 7 journeys each, axe clean; `pnpm docs:check`; `git diff --check`.

## Production

Merge and deploy; there is no database step.
