# WI-069 handoff — Focus stays, modal forms, rain and brown noise

Date: 2026-10-29. Branch `feat/wi-069-focus` from `main` `9bae032` (WI-068).

**Source.** The owner's UAT on production after WI-068:

- Pause on Focus went to Today; Resume came back to Focus. Was that right?
- What Keep screen on and Chime at the end do.
- The in-place Add a block card looked wrong; a form should sit in the middle of the screen and scroll inside itself.
- Could Focus be more present than the sidebar card and the pop-out?
- Rain and brown noise sounded harsh.
- Find more on Today.

I drove every control on Today on the local build (day arrows, More, shortcuts, the row's ⋯, Skip and Undo, Reschedule, Log time, Complete, Reset, Cancel, Notes, Activity, Goal, Review day, the phone bar) and read production Today in the owner's Chrome. Everything held except:

- The free launcher offered the roadmap item whose block was just done today ("Internet & network foundations" Done, then Free now: the same).
- A block begun inside its slot read "of 19 min" or "of 29 min", since the window ran from the session's start, forty seconds in.
- Esc did not close the in-place Add a block.

**Owner's choices (2026-10-29):** Pause stays on Focus; Add a block and the details both as a centred modal; the countdown in the tab's title; rebuild the two sounds.

**Migration:** none.

## What changed

| Part        | Where                                                                 | What                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pause stays | `src/features/execution/focus.tsx`                                    | A successful Pause does `router.replace('/focus?block=<id>')`, and the paused card shows the ring held, "N min so far · Resume when you are ready." and Resume. Complete goes to Today as before.                                                                                                                                                                                                                                            |
| Slot window | `src/features/execution/focus-domain.ts`                              | `focusWindow` for a first session begun inside its slot runs the slot itself (`start = plannedStart`), so "left of N min" is the block's length. An early start keeps the planned length from the start (WI-058).                                                                                                                                                                                                                            |
| Tab title   | `src/features/execution/title-clock.tsx`, `running.tsx`               | `TitleClock` writes "17:34 · <title>" every second while a session runs, stripping its own prefix first, so Next.js's title on navigation is kept. It leaves the title plain when the session ends.                                                                                                                                                                                                                                          |
| Modal       | `src/components/side-panel.tsx`, `globals.css`                        | `SidePanel variant="modal"` centres the panel (560 px, its body scrolls, the page does not), with the same inert page, focus trap, Esc and focus return. `usePanelFocus` exposes the `focus` it opened with. On a phone it keeps clear of the bottom bar.                                                                                                                                                                                    |
| Today       | `src/features/today/agenda.tsx`, `first-run.tsx`, `detail-tabs.tsx`   | Add a block and a block's details are modals again, with WI-068's content: one recorded total with one Delete, then `DetailTabs` (Log time · Edit), which opens on the tab Log time or Reschedule asked for. `row-details.tsx` is gone; the command bar's Log time opens the panel on its form again.                                                                                                                                        |
| Free pick   | `src/features/today/domain.ts` (`freePick`), `src/app/today/page.tsx` | The launcher's pick skips a title that is a block completed today.                                                                                                                                                                                                                                                                                                                                                                           |
| Sounds      | `src/lib/ambient.ts`                                                  | `rain` and `brown` build stereo loops offline from pure generators, with one-pole `lowpass` and `highpass`. Rain: a faint pink bed between 500 Hz and 2.5 kHz and 160 drops a second (2–14 ms bursts, each with its own brightness, loudness and pan; one in fifty a plink). Brown: the random walk kept under 180 Hz with the drift under 25 Hz removed, two independent channels. Each sound has its own level (`LEVEL`) and a slow swell. |

**Keep screen on** asks the browser's Screen Wake Lock, so the screen does not dim or lock while Focus is open. **Chime at the end** plays two soft notes when the time is up; it is off by default and kept per device. Neither is tied to Complete.

**Pop-out.** Chrome keeps a Document Picture-in-Picture window above every other window already; it closes only on a full page load or when the tab goes, which is the browser's rule. The tab title is the other place the time now shows.

## Tests

**New:**

- `tests/today-pick.test.ts`: the free pick skips a block done today, whatever its case, and keeps a planned or skipped one.
- In `tests/focus-sound.test.ts`: rain has drops above its bed (crest factor above 6), is stereo (channel correlation under 0.6) and never silent; brown noise is darker than the raw walk, stereo and without drift; the filters pass what they should.

**Updated:**

- `tests/resume-domain.test.ts`: a session begun inside its slot runs the slot; an early start keeps the planned length.
- `tests/command-database.test.ts`: Log time opens the block's panel on its form again.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 116 files, 627 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright)

- **Modal.** Add a block opened centred (x 440, 560 wide, at y 107 in 1440×900), the page's scroll off and the body's on. N opened it, Esc closed it. The block was added and the modal closed.
- **Title.** Focus read "29:26 left of 30 min" with the tab "29:26 · Focus · Silsila"; on Roadmap "29:23 · Roadmap · Silsila".
- **Pause.** The URL stayed on Focus; the card read "28:55 · Paused · left of 30 min · 1 min so far · Resume when you are ready."; the tab's title went plain; the sidebar read Paused with the same time.
- **Resume.** Still on Focus, "28:53 left of 30 min", the title ticking again.
- **Complete.** Today, plain title, the free launcher offering a different item.
- **Details.** The modal showed "Recorded 1 min" with Delete, and Log time opened its form.
- **Phone 390.** The modal had no overflow and axe was clean. The bottom-bar clearance was added after the screenshot and is CSS only.
- **Sounds.** Measured, not heard: the rain loop's crest factor is 10.5 (drops over a bed), the brown loop's 4.4; both stereo. The owner judges them by ear.

## Production

Merge and deploy; there is no database step.
