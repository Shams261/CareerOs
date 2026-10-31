# WI-096 handoff — Jobs redrawn

Date: 2026-10-31. Branch `feat/wi-096-jobs-redraw` from `main` `91e5cff` (WI-095).

**Source.** The owner asked for the Jobs page to get the same loop as the roadmap and Practice, with mock-ups before the work. `output/Silsila-Jobs-Check-and-Mock.pdf` (not committed): 8 security probes (0 holes), 20 feature checks (1 bug), the critique, the list and the application page redrawn. The owner accepted the bug and all twelve suggestions.

**Migration:** none.

## What changed

| #   | Was                                                                                                    | Now                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | After Log the result moved the application, the Stage select kept its old value until a reload.        | `StageRow` is keyed by the stage and remounts with the new value; "Move to…" saves on choice through `stageAction` with `broadcast="stage"` and Undo.                                                                                                                                   |
| S1  | "Applications" heading with Add application opening a form in place; More beside the title.            | `page-head is-practice is-jobs`: title left, More · Add application at the right; Add application is a modal (`add-application`) that closes on save (`ActionForm closePanelOnSuccess`, new). On a phone the primary sits under the title row.                                          |
| S2  | This week as a rail card.                                                                              | The second `jobs-facts` line under the counts.                                                                                                                                                                                                                                          |
| S3  | Needs attention in the rail repeating the list ("The 4 moves are in Applications").                    | The rail is Interviews next (`upcomingInterviews`: company · round · Today/Tomorrow/weekday · time · prep open · AI rule, linking to the round) and the next job-search block; Needs attention stays on Today.                                                                          |
| S4  | 110 px rows with a briefcase tile, the company in uppercase meta, three lines.                         | `ApplicationRow` as two lines (`job-row`): company · role, then the move with `Move.detail` (the due context without the role, new on `applicationMove`), the next interview's day at the right; about 67 px.                                                                           |
| S5  | Section headings at 28 and 26 px.                                                                      | The shared `section-head` at 19 px; rail cards as `card rail-card`.                                                                                                                                                                                                                     |
| S6  | Six funnel rows, three all zeros.                                                                      | `funnelRows` folds weeks with nothing (this week always shows); "Show all N weeks" / "Fold the empty weeks" (`?funnel=all`).                                                                                                                                                            |
| S7  | Views as underlined 20 px links.                                                                       | `jobs-views` pills, the current one in ink, 32 px tall.                                                                                                                                                                                                                                 |
| S8  | "Stage" label, a select and a Move button under the title; the facts under them.                       | `StageRow`: the pipeline's steps as pills (passed tinted, current filled, a closed stage as its own filled pill), "Move to…" at the end; the facts line (Applied via, Recruiter, Closed) under it.                                                                                      |
| S9  | A "Next move" card holding the strip.                                                                  | The strip alone (`next-move-section`) under the facts.                                                                                                                                                                                                                                  |
| S10 | Formats before Interviews; "PREPARE WITH RUMI" heading plus the button; Add interview as a disclosure. | Interviews, then Formats, then Timeline; Prepare with Rumi (and the doc links) and Add prep in the round's action row; Add interview a modal (`add-round`) from the section head, closing on save.                                                                                      |
| S11 | Contacts, Notes and Edit application as three rail sections; Delete at the end of the edit panel.      | One Details card (Applied via, Where, Recruiter, Hiring contact, Priority, Notes, Offer / compensation, the job description, resources) with Edit or Add details; Job posting as the head's secondary; Edit and Delete application in the head's ⋯ (Delete focuses the panel's Delete). |
| S12 | 18 px checkbox, 14 px ×, 16 px back link.                                                              | The prep checkbox 22 px, the × 28 px, the format links with padding. `tests/jobs-security.test.ts` added (three cases, sixteen refused writes, links, replay and duplicates).                                                                                                           |
| —   | On a phone the rail came before the list (601 px to the first application).                            | The list first (`'main' 'rail'`); the first application near 440 px under the head, the facts and the views.                                                                                                                                                                            |

## Tests

- `tests/jobs-domain.test.ts`: `upcomingInterviews`, `funnelRows`, `Move.detail`.
- `tests/jobs-security.test.ts` (new).
- `e2e/journeys.spec.ts`: the Jobs journey adds through the modal (it closes on save, so each add clicks Add application).

## Checks

`scratchpad/uiux/check096.ts` on the final build: the head and facts, two-line rows, the views, the rail, the folded funnel, the modal add, the application head's ⋯, the stage row saving on choice with Undo, the strip, the section order, the Add interview modal, the round's buttons, the Details card and Delete from ⋯, axe clean in light and dark and on a phone, no console errors, no overflow, the first phone row at 441 px.

## Gate

`pnpm typecheck`, ESLint and Prettier clean; `pnpm test:ci` on a fresh database; `pnpm build`; `pnpm test:e2e` and `pnpm test:e2e:safari`; `pnpm docs:check`; `git diff --check`.
