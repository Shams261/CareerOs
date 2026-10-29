# WI-066 handoff — Today fixes from the owner's UAT

Date: 2026-10-28. Branch `feat/wi-066-today-fixes` from `main` `a3b89aa` (WI-065).

**Source.** I tested every control on production Today in the owner's Chrome, after the owner reported three issues:

- the pop-out timer stopping on other pages;
- cancelled blocks that cannot be deleted;
- a long Add a block form.

The audit found further functional and UI issues, listed below. The owner asked for all of them in one item.

**Migration:** none.

## What changed

| #   | Issue found                                                                                                                                         | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Where                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Pop out closed (or froze) on leaving Focus. Focus owned the PiP window and closed it on unmount.                                                    | The app owns the window: a store with `openFocusPip` and `closeFocusPip`, plus `PipHost`, mounted in the shell's `RunningNow`. It ticks on the PiP window's own clock and closes when the shown session is no longer the running one. Focus only opens or closes it. `Ring` and `clock` moved to `ring.tsx`.                                                                                                                                                                                    | `src/features/execution/pip.tsx`, `ring.tsx`, `focus.tsx`, `running.tsx`                                        |
| 2   | Cancelled rows could not be deleted. ⋯ offered only Reset; Delete was at the bottom of the details panel; a routine's block could never be deleted. | Delete (red) in the row's ⋯ for any block without recorded time (`executionAction` `action=delete` → `deleteBlock`, Undo `block-reset`). `deleteBlock` now also takes a routine's occurrence and keeps it as "Deleted", so generation never brings it back and the routine is untouched.                                                                                                                                                                                                        | `schedule/actions.ts`, `schedule/forms.tsx`, `deletes/service.ts`, `today/agenda.tsx`                           |
| 3   | Undo vanished after a delete that emptied the day. The outlet unmounted with the layout.                                                            | Row results broadcast to `blocks`. `feedback-channel` keeps each channel's last result for 10 s and replays it to the first outlet that mounts alone on that channel.                                                                                                                                                                                                                                                                                                                           | `components/feedback-channel.ts`, `schedule/forms.tsx`                                                          |
| 4   | Add a block had 10 fields inline beside the heading, defaulting to 09:00–10:00 late at night.                                                       | A side panel. A new block is `QuickBlockFields`: title, kind chips, start, end and length chips (20/30/45/60). Goal, priority, dates and notes sit under More. "Allow overlap" stays in view, because an overlap refusal asks for it. Defaults come from `nextSlot`: the first quarter hour from now where 30 minutes fit beside the day's live blocks, or 09:00 on another day. The More menu's Add and the N shortcut open the panel (`data-shortcut="add-block"`). Edits keep the full form. | `schedule/quick-fields.tsx`, `schedule/forms.tsx`, `today/domain.ts`, `today/agenda.tsx`, `today/first-run.tsx` |
| 5   | Two clocks: the sidebar counted up (0:47) while Today and Focus counted down (29:30 left).                                                          | `LiveLeft` in the running card counts down to the block's `focusTarget`. A session without a block still counts up.                                                                                                                                                                                                                                                                                                                                                                             | `execution/live.tsx`, `running.tsx`                                                                             |
| 6   | Done or running blocks were grouped as Later by their planned time.                                                                                 | `groupAgenda`: Completed or Skipped → Earlier; In progress → Now; the rest by time.                                                                                                                                                                                                                                                                                                                                                                                                             | `today/domain.ts`                                                                                               |
| 7   | Start session did not start; Focus then asked to Begin.                                                                                             | Start submits `action=focus`. The session starts and Focus opens already running. The redirect stays outside `perform`, and a refusal shows beside the button. A direct `/focus?block=` link still asks to Begin.                                                                                                                                                                                                                                                                               | `schedule/actions.ts`, `schedule/forms.tsx`                                                                     |
| 8   | Plan my first focus defaulted to a past time.                                                                                                       | Same as #4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `today/first-run.tsx`                                                                                           |
| 9   | "0 blocks · none left ahead" when only cancelled blocks exist.                                                                                      | "Nothing planned · 1 cancelled".                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `today/agenda.tsx`                                                                                              |
| 10  | Review day offered closing the day mid-session.                                                                                                     | A status line: "A session is still running. Stop or complete it before you close the day."                                                                                                                                                                                                                                                                                                                                                                                                      | `app/today/page.tsx`                                                                                            |
| UI  | The Activity sentence overlapped its rings; the goal title field was half width; a result in the Up next card squeezed the title.                   | Chain margin in panels; `.form-wide` on the goal title; `.launcher-side` max 320 px with results wrapping.                                                                                                                                                                                                                                                                                                                                                                                      | `globals.css`, `roadmap/forms.tsx`                                                                              |

**Not changed:**

- **Category codes.** The edit form still shows `TECHNICAL` / `SYSTEM_DESIGN`. These are the stored codes and the existing category list; a new block now uses kind chips.
- **12-hour time fields.** Native `type="time"` fields follow the browser's locale; the rest of the app keeps 24-hour text.
- **⌘K focus.** The search box not taking focus when the extension sent ⌘K did not reproduce by hand; the bar focuses its input on open.

## Tests

**New:** `tests/today-fixes.test.ts` covers:

- `nextSlot`: the next quarter hour, skipping a busy block, stopping late at night, and another day;
- the feedback replay after a layout change.

**Updated, following the owner's decisions:**

| File                             | Change                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `tests/today-domain.test.ts`     | Grouping: a block completed before its slot is Earlier, and a running block is Now. |
| `tests/deletes-database.test.ts` | A routine's occurrence is deleted as "Deleted".                                     |
| `e2e/journeys.spec.ts`           | Opens Focus by the row's id to keep testing Begin.                                  |

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a disposable database: 112 files, 606 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build)

**Playwright run:**

1. **Add a block.** The panel defaulted to 21:45, the next free slot. The 45 min chip set 22:30, and the row read Up next.
2. **Delete from ⋯.** It showed "Deleted WI066 check. Undo", and Undo brought the block back.
3. **Start session.** Focus opened already running, with no Begin.
4. **Plan page.** The sidebar read "44:57 left".
5. **Grouping.** The running block was under Now and the done one under Earlier.
6. **Review day while a session ran.** It showed the warning.

There were no console errors, and axe was clean.

**Pop-out, in Chrome against the local copy:**

1. Pop out showed "44:02 left of 45 min · WI066 check".
2. Moving from Focus to Roadmap kept it open and counting (43:48 → 43:45 → 43:42).
3. Stop on the running card closed it.

The desktop app's own browser pane does not open Document PiP.

## Production

Merge and deploy; there is no database step.

The production test record "UAT check: later block" (done, with a 2-minute session) is still there. To remove it, delete its session in the block's panel, then the block.
