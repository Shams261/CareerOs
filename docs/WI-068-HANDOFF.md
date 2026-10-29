# WI-068 handoff — Resume where it paused, forms in place

Date: 2026-10-28. Branch `feat/wi-068-resume` from `main` `192db5c` (WI-067).

**Source.** In UAT on production after WI-067, the owner found five things:

- Resume restarted the timer at the full 30 minutes.
- The pop-out and the sidebar card disappeared on Pause.
- A timer seemed to run after Complete.
- Every pause left its own "Recorded" line with its own Delete.
- The block forms were long and opened in a side panel.
- Focus sat against the sidebar.

I reproduced each one in the owner's Chrome on production, and found more of the same kind:

- The suggested time for a new block overlapped a done block, so Save refused it.
- Log time started with a future slot, which Save also refuses.
- A paused card read "Starts in 29 min".
- A Pause in one tab left a Focus page or pop-out in another tab running.

**Owner's choices (2026-10-28):**

- The sidebar card on every page.
- One Delete removes all the time recorded on a block, and the block is planned again.

**Migration:** none. Each Start still records its own session, which keeps the record true, and the screens read the sessions as one.

## What changed

| Part             | Where                                                                                                                                                                         | What                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resume continues | `src/features/execution/focus-domain.ts`                                                                                                                                      | `focusWindow` starts the ring's window `doneBefore` ms before the resumed session and lasts the block's planned length. A first session keeps `focusTarget`. `recordedBefore` sums finished sessions; `pausedLeft` is what a paused block has left.                                                                                                                                                                 |
| Every clock      | `src/app/focus/page.tsx`, `focus.tsx`, `src/features/today/launcher.tsx`, `running.tsx`                                                                                       | Focus, Today's card, the sidebar and the pop-out all use the window. A paused card reads "28:57 left · Until 23:49". Focus on a paused block shows the still ring and Resume.                                                                                                                                                                                                                                       |
| Pop-out          | `src/features/execution/pip.tsx`                                                                                                                                              | The window belongs to the block (`PipSession.key`). `PipHost` takes the server's view from `RunningNow`: running (ticks), paused (stands still, "Paused") or none (closes).                                                                                                                                                                                                                                         |
| Other tabs       | `pip.tsx`                                                                                                                                                                     | `PipHost` posts the view on a `BroadcastChannel` when it changes. Another tab with a different view calls `router.refresh()`.                                                                                                                                                                                                                                                                                       |
| Sidebar card     | `src/features/execution/running.tsx`, `globals.css`                                                                                                                           | One query: the running session, else the last one ended in 24 hours, with its block and finished sessions. A paused block keeps the card with its time left, Resume and Complete. It shows on Today and Focus too; the phone strip still steps aside there.                                                                                                                                                         |
| One record       | `src/features/deletes/service.ts` (`clearBlockTime`), `actions.ts` (`clearBlockTimeAction`), `src/features/undo/service.ts` (`restore-block-time`, shared `restoreSessionIn`) | Deletes every finished session of a block under the owner lock. A done block becomes Planned. It refuses a running block. Undo puts the parts back with their attempts and activities, and marks the block done again.                                                                                                                                                                                              |
| Details in place | `src/features/today/row-details.tsx`, `agenda.tsx`                                                                                                                            | `RowButton`, `RowDetails` and `RowTabs` replace the block's side panel. One row is open at a time, and Esc closes it. Log time and Reschedule open it on their tab. The command bar's Log time presses `[data-row-open][data-row-focus="log"]`.                                                                                                                                                                     |
| Add in place     | `agenda.tsx`, `first-run.tsx`, `globals.css`                                                                                                                                  | Add a block is a `Disclosure` (`agenda-add`, `shortcut="add-block"`, the draft key). Its card spans the heading row.                                                                                                                                                                                                                                                                                                |
| One short form   | `src/features/schedule/quick-fields.tsx`, `forms.tsx`                                                                                                                         | Adding and editing share one form. `QuickBlockFields` holds the title, the kind chips (a stored kind outside them gets its own chip), the start and end, and a note. `LengthFields` holds the length chips: 30 min to 1.5 hours for a block, 15 to 60 min for Log time. Goal, priority and another day sit under More. The checkbox reads "Allow this overlap", as the refusal names it. `time-length.tsx` is gone. |
| Log time         | `src/features/schedule/log-time.ts`                                                                                                                                           | `logDefaults` takes the slot once it is over, else the slot's start to now, or half an hour back before it begins.                                                                                                                                                                                                                                                                                                  |
| Suggested time   | `src/features/today/domain.ts`, `agenda.tsx`                                                                                                                                  | Every block not cancelled is busy, as the overlap check counts it. Late at night it takes the minutes after the last block.                                                                                                                                                                                                                                                                                         |
| Focus            | `globals.css`                                                                                                                                                                 | `.focus-page` is centred.                                                                                                                                                                                                                                                                                                                                                                                           |

## Tests

**New:**

- `tests/resume-domain.test.ts`: the resume window, recorded-before, paused-left, Log time defaults, the suggested time with a done block and late at night, and length labels.
- `tests/resume-database.test.ts`: one Delete for a paused-and-resumed block with Undo, including notes and done state, and the refusals (running, no time, another owner's).

**Updated:** `tests/command-database.test.ts`. Log time now presses the row's Log time instead of opening a panel.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 115 files, 622 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright)

**Focus:** Start, then a minute on Focus with the page centred (216 px each side).

**Pause:**

- The card read "PAUSED · 1 MIN SO FAR · 28:57 left · Until 23:49", with Complete and Resume.
- The sidebar card read Paused, with the same time left, on Today and on Roadmap.

**Resume from the sidebar:** Focus continued at 28:56 left of 30 min.

**Two tabs:** a Pause in the second tab refreshed the first. Its sidebar and Focus read Paused, with Resume.

**Details:**

- They opened under the row, with no dialog, showing "Recorded 1 min" and one Delete.
- Delete reset the row to Up next, and Undo brought back "1 min so far · Paused".

**Add a block:**

- The suggested time was free (23:49–23:59, after a block ending 23:49), and the block was added.
- Log time on the later block started at 23:10–23:20, when it was 23:20.

**Complete from the sidebar:** no card and no timer were left.

**Pop-out (headed Chromium):**

| Step                         | It showed                          |
| ---------------------------- | ---------------------------------- |
| Running                      | 9:51                               |
| Roadmap, reached by its link | Still running                      |
| Pause                        | "9:50 Paused", unchanged 3 s later |
| Resume                       | 9:48 left                          |
| Complete                     | Closed                             |

**Width and themes:** axe was clean at 1440 (light) and at 390 in light and dark, with no overflow.

## Notes

- `deleteSessionAction` (one part at a time) has no button any more; the action and its `restore-session` undo stay.
- A full page load closes a pop-out, since the browser ends it with the page. Moving within Silsila keeps it.

## Production

Merge and deploy; there is no database step.

The owner's test blocks "UAT check: pause" and "UAT check: resume" remain on production. To remove them, open each row's details, Delete its recorded time, then Delete this block.
