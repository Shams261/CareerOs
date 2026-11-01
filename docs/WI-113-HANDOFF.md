# WI-113 handoff: Rumi on Jobs, Practice and Weekly review

Date: 2026-11-01. The owner asked why Jobs, Practice and Weekly review had no Rumi after WI-111 and WI-112. One pose per place, on the cream tile, where it sits naturally. No migration, no new data.

## What changed

| Page          | Where                                                             | Pose                                                 |
| ------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| Jobs          | No application yet: the setup card (in place of its illustration) | Heading out                                          |
| Jobs          | The rail's Interviews next card, in its corner                    | Interview ready                                      |
| Practice      | No topic yet: the setup card (in place of the mark)               | Thinking                                             |
| Practice      | Beside the facts line; smaller on a phone                         | Revision cards while revisions are due, else working |
| Weekly review | An empty week: the setup card                                     | Sitting                                              |
| Weekly review | Reflect: the rail's The week in short card, in its corner         | Writing                                              |
| Weekly review | Next week: the Close the week card, in its corner                 | High five                                            |

The week step keeps the calendar pose beside Sum up the week (WI-110/111). Shared styles: `.setup-pose`, `.has-corner-pose` with `.corner-pose` (the heading and first line keep clear of it), `.practice-facts-row`.

## Tests

`e2e/journeys.spec.ts`: the Rumi button journey now also expects a pose on Jobs and Practice. Browser-checked at 1440 and 390 px in Light and Dark on Jobs, Practice, Reflect and Next week: no overflow, no console errors, no failed image requests, axe clean.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database (800), build, `test:e2e` and Safari (15 each), docs:check, `git diff --check`.
