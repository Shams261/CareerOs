# WI-070 handoff — Today polish from UAT

Date: 2026-10-29. Branch `feat/wi-070-today-polish` from `main` `0fa4d25` (WI-069).

**Source.** The owner's UAT after WI-069:

- The sidebar's running or paused card sat below the fold; the page had to scroll to reach Resume.
- A paused block's time on Today was small meta text, not the countdown.
- Deleting a block with recorded time took two steps: Delete recorded time, then Delete this block.
- Plan my first focus opened as a side panel while Add a block was a modal.
- The Add a block form was tall and carried goal, priority and another day.

Measured on the local build at 1366×700: the card spanned y 605–796 on every page; the Add modal was 560×652 with its body scrolling. I also found that a Delete inside the modal showed its Undo behind the modal.

**Owner's choices (2026-10-29):** the card under the search box; one Delete that takes the block and its time; Add a block with title, kind, start, end, length and note only.

**Migration:** none.

## What changed

| Part                | Where                                                                                                                            | What                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card position       | `src/app/layout.tsx`, `globals.css`                                                                                              | `RunningNow` renders before `Navigation`, under the search box. The card is compact: eyebrow, title, the time at 20 px, Resume and Complete (or Focus and Pause) in a row.                                                                                                                                                                                                                 |
| Paused countdown    | `src/features/today/launcher.tsx`, `globals.css`                                                                                 | The paused card shows the time left as the held countdown (`.live-countdown.is-paused`), its bar still, in the running countdown's place; the meta line keeps "Until 09:51".                                                                                                                                                                                                               |
| One Delete          | `src/features/deletes/service.ts`, `domain.ts`, `actions.ts`, `src/features/schedule/actions.ts`, `src/features/undo/service.ts` | `deleteBlock` deletes the block's finished sessions through `takeSessions` and returns them with the title and `completedAt`; a running session refuses. `blockUndo` builds the `restore-block` undo, which resets the block, re-creates each session with its attempts and activities, and marks a done block done again. `clearBlockTime`, its action and `restore-block-time` are gone. |
| Delete in the modal | `src/features/today/agenda.tsx`, `src/components/confirm-delete.tsx`                                                             | A block with recorded time shows `ConfirmDelete` ("Delete X and its 12 min recorded?"); one without it keeps the plain Delete. Both close the modal on success (`closeOnSuccess`, new on `ConfirmDelete`), so the Undo above the list is in view. The recorded line no longer has its own Delete.                                                                                          |
| First run           | `src/features/today/first-run.tsx`                                                                                               | Plan my first focus, Choose your goal and Set your study times are `variant="modal"`.                                                                                                                                                                                                                                                                                                      |
| Short Add           | `src/features/schedule/forms.tsx`, `overlap-check.tsx`, `src/components/action-form.tsx`, `globals.css`                          | A new block's form has no More: the day, `endDay`, priority 2 and no goal are hidden fields. Edit keeps More. `ActionForm` provides its last result (`useFormResult`), and `OverlapCheck` renders "Allow this overlap" only when that result is an overlap refusal. The modal is 520 px with tighter gaps.                                                                                 |

## Tests

| File                             | Change                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/deletes-database.test.ts` | A block with recorded time deletes with its time; `restore-block` brings it back done with the session; the other cases read `.title`.                                   |
| `tests/resume-database.test.ts`  | The one-step Delete: a paused-and-resumed block goes with both parts and Undo restores them, their notes and the done state; a running block and another owner's refuse. |

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 116 files, 627 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build at 1366×700, Playwright)

- **Add a block:** 520×582, no scroll; fields Title, Kind, Start, End, Length, Note. A second block at the same time was refused with "Overlap: …" and only then showed "Allow this overlap"; ticked, it was added.
- **Card:** running on Focus at y 141–291, paused on Today and on Roadmap at y 141–269, all in view on a 700 px screen.
- **Paused Today card:** "29:59 · left of 30 min" as the countdown, "DSA · Until 10:38" under the title.
- **Delete:** the modal showed "Delete WI070 undo and its 10 min recorded?"; Delete closed the modal, the row went, "Deleted WI070 undo. Undo" showed above the list; Undo brought the row back with "10 min recorded".
- **Phone 390:** no overflow, axe clean on Today with the modal open and closed.

## Production

Merge and deploy; there is no database step.
