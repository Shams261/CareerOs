# WI-029: Close the Day

Date: 2026-10-25. Branch `feat/wi-029-close-the-day` from `main` `d6ea829` (WI-028). This is Phase 1, slice 3 of the Version 2 plan (`docs/product/v2-plan.md`, section 5). No schema change.

## Outcome

**When it appears.** On a past day, or on today from the owner's stop time, Today's Review day becomes **Close the day**. A day that is already reviewed keeps Edit review.

- The stop time is the daily reminder time, or 21:30 when none is saved (`closeDayOpen`, `stopTime`).
- From the stop time, today's launcher also shows "End of the day · Close the day" as its one primary action. After the close it reads "Day closed".

**The panel** (`CloseDayForm`) is one form with three headed steps. Nothing changes until Close the day is pressed.

1. **What happened:** the day's facts line, then each block with its time, what was recorded and its status, in Today's words. An empty day says "Nothing was planned today" or "Rested today", or "that day" on a past date.
2. **Anything to remember?** One line, saved as the check-in's notes. It is prefilled when a check-in exists.
3. **What is left:** one required radio group per block without a decision.
   - **A block with no recorded session** offers **Tomorrow** with its preview, or **Let go**. The preview reads "Moves to Mon, Oct 26 · 18:00". When that time is taken, the next free quarter hour is offered with a reason: "Moves to Mon, Oct 26 · 16:45 (16:15 is taken)". A tomorrow with no room disables Tomorrow and says to pick a time from the block's row.
   - **A block with recorded time** offers **Done** (showing what was recorded) or **Let go**.
   - **An interview's block** offers **Let go** only, with a "Log its result" link to the round. Moving the block would move the interview.

A missing choice answers "Answer “Two pointers practice · 18:00–19:00” first." inline.

**One transaction** (`closeDay` in `src/features/close-day/service.ts`). Under the owner lock:

- Tomorrow moves the block through the existing writer (`saveBlockIn`).
- Let go skips it with the reason "Let go", through `executeIn`.
- Done completes it.
- The check-in line is saved with `recordReview`. That marks the day reviewed, keeps an earlier rating, blocker and carry-forward, and reads the day's review reminders and Study Nudges.

If anything no longer matches the preview, the whole close is refused and **nothing is written**:

- A previewed slot is now taken: "Tomorrow 16:45 is no longer free for Binary search drill. Nothing was changed."
- A block changed in another tab.
- A choice is missing.
- A session is running.

The panel stays open with the message. The answer reads "Day closed · 1 moved to tomorrow · 1 marked done." Google Calendar catches up after a move.

## Refactors (behaviour unchanged)

- `saveBlock` and `execute` now run `saveBlockIn` and `executeIn` inside their own lock. Close the Day calls the inner functions in its one transaction.
- `reviewAction` writes through the new `recordReview` in `src/features/schedule/service.ts`. On an existing check-in it updates only the fields it is given.
- The review panel's "Reviewed · time" now uses `hhmm` (24-hour) instead of a 12-hour `Intl` format.

## Differences from the plan

- **Stop time default** is 21:30, the app's existing daily reminder default, not the plan's 21:00. The repository wins.
- **Tomorrow** always means the owner's tomorrow, also when closing an earlier day, so a move never lands in the past.
- **Recorded blocks** get Done or Let go instead of Tomorrow, because moving them would take their recorded time to another day.
- **Interview blocks** get Let go only.
- **Steps.** The three steps are headed sections of one scrolling form, not a stepper. Every choice stays visible before Close.
- **Taken slots.** A taken slot moves to the next free time, with the reason shown. When there is none, Tomorrow is disabled and the owner picks a time from the row; the editor does not open by itself.
- **No Undo** for the whole close. Each block can still be reset or moved from its row.

## Changes

| Area    | Files                                                                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/features/close-day/{domain,service,actions}.ts`, `src/features/close-day/form.tsx`, `tests/close-day-domain.test.ts`, `tests/close-day-database.test.ts`, `docs/screenshots/wi-029/`    |
| Changed | `src/app/today/page.tsx`, `src/features/today/{header,launcher}.tsx`, `src/features/schedule/{editing,service,actions}.ts`, `src/features/execution/service.ts`, `src/app/globals.css`, docs |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree                                                                                                                                                                                                                                                                                                         |
| `pnpm test:ci` (disposable database)     | 54 files, 370 tests pass. Close the Day domain 12, database 5                                                                                                                                                                                                                                                                                  |
| Browser, past day (desktop, light)       | Close without choices showed the inline message and wrote nothing. Let go on an interview block and Done on a recorded block closed the day, saved the line and showed Reviewed                                                                                                                                                                |
| Browser, today after the stop time       | The launcher showed Close the day. Tomorrow offered 16:45 because 16:15 was taken. Taking 16:45 behind the form's back refused the close, and the Done choice in the same close was rolled back too. After freeing it, the block moved to Monday 16:45, the other block was done, the evening nudge was read, and the launcher said Day closed |
| Browser, 390 light and dark              | No horizontal overflow, choice rows 47 px, no console errors                                                                                                                                                                                                                                                                                   |

Screenshots: `docs/screenshots/wi-029/`.

## Owner steps

None before merging: there is no migration. After the deploy, Close the day appears on Today from your daily reminder time (21:30 unless you changed it).
