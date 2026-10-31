# WI-095 handoff — Practice, the final check's fixes

Date: 2026-10-31. Branch `fix/wi-095-practice-final` from `main` `bfaa6d8` (WI-094 and the deployment note).

**Source.** The owner asked for a last complete check of Practice (security, every feature, the UI) and flagged the Study strip. `output/Silsila-Practice-Final-Check.pdf` (not committed): 11 security probes, 30 feature checks, four bugs, five suggestions. The owner accepted all of them.

**Migration:** none.

## What changed

| #       | Was                                                                                              | Now                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1      | Two Mark revised in a row (a double click) settled two steps.                                    | The form carries `step`; `markRevised(user, id, step)` refuses a step that is not the open one ("Revision 1 is already marked." / "That revision is not open yet."); the fieldset disables while pending as before.                                   |
| B2      | Change revision date accepted a day in the past, which the next read settled as missed.          | The field has `min` = the owner's day (`RevisionForm today`); `scheduleRevision` refuses an earlier day ("Pick today or a later day.").                                                                                                               |
| B3 / S1 | The Study strip: a button joined to a select of another height, a seam, the doubt link under it. | The roadmap's tool card (`StudyPrompt card`, `.problem-study .pane-tool.is-prompt` at 480 px): "Copy the study prompt", the scenario, the select and "+ Add a doubt" under it. The non-card strip is back to its plain WI-091 form for any other use. |
| B4      | The attempt's answer vanished with the form's reset (the fields remount).                        | `AttemptForm` takes the result through `onSettled`, shows it above the fresh fields for eight seconds (`.attempt-note-line`).                                                                                                                         |
| S2      | An attempt while a step was open counted as that revision, even on the ladder's first day.       | `recordAttempt`: `due` revises the step; `upcoming` records the attempt only; none or finished starts a ladder. ADR-029 amended.                                                                                                                      |
| S3      | Add a problem's Topic defaulted to the current topic only.                                       | To the current topic, else the working topic (the one Next problem is in).                                                                                                                                                                            |
| S4      | The revision panel said "1 of 3 · Due today"; Today's row "Revision due today · 1 of 3".         | Both read the list's `ladderLine` ("Revision 2 of 3 · Due today · missed 1"); the row's older forms stay as the fallback without a line.                                                                                                              |
| S6      | Today's practice row ended in the colour word ("· Yellow"), against the words rule of WI-063.    | `confidenceWord`: "· Okay". The attention and Today order tests' expected strings are corrected with it (a rule the test had encoded wrongly, not a weakened test).                                                                                   |
| S5      | —                                                                                                | `tests/practice-security.test.ts`: another owner's problem refused by every write, settlement per owner, hostile title kept as text, links, dates, and the double Mark revised.                                                                       |

## Tests

- `tests/practice-security.test.ts` (new, five cases); `tests/dsa-database.test.ts`: three same-day attempts leave the ladder at step 1 (S2).
- The e2e Practice journey is unchanged (the first attempt still shows "1 of 3"; Copy prompt is not part of it).

## Checks

`scratchpad/uiux/final-practice.ts` re-run on the final build; the study card, the attempt's answer and the double click checked by hand in the lab at 1,440 and 390 px, light and dark, with axe.

## Gate

`pnpm typecheck`, ESLint and Prettier clean; `pnpm test:ci` on a fresh database; `pnpm build`; `pnpm test:e2e` and `pnpm test:e2e:safari`; `pnpm docs:check`; `git diff --check`.
