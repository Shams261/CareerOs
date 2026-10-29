# WI-072 handoff — Today final

Date: 2026-10-29. Branch `feat/wi-072-today-final` from `main` `81d14f2` (WI-071 and its fix).

**Source.** The owner's UAT after WI-071, and a final audit of Today on the local build (1366×700 and 390, axe, console) and read-only on production:

| #   | Found                                                                                               | Measured                                                                           |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | The start field sat above the length chips                                                          | field 394–438, chips 420–452; label margins 14 px against 6 px, `align-items: end` |
| 2   | Plan my first focus listed two picks before the form; the owner wants the form at once              | —                                                                                  |
| 3   | The row's ⋯ menu ran off a phone screen                                                             | x −61, 200 px wide, viewport 390                                                   |
| 4   | Pause and Complete from the sidebar showed no message                                               | the card went, nothing read "Done · …"                                             |
| 5   | Review day, the goal, Notes, Activity and Needs attention were still side panels beside modal forms | —                                                                                  |
| 6   | A block's details with Edit open scrolled on a 700 px screen                                        | modal 652, body 619/583                                                            |

**Owner's choice (2026-10-29):** forms (Review day/Close the day, the goal) as modals; lists (Notes, Activity, Needs attention) keep the side panel.

**Migration:** none.

## What changed

| Part             | Where                                | What                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First focus      | `src/features/today/first-run.tsx`   | Plan my first focus opens the `add-block` modal; the `first-focus` panel is gone. The link under the button still starts a 20-minute session on the first pick.                                                                                                                                                         |
| One line         | `globals.css` (`.quick-when`)        | `align-items: start`, both labels at margin 0 with the legend's 6 px, and the chips row at the field's 44 px height, centred.                                                                                                                                                                                           |
| Phone menu       | `globals.css`                        | Under 700 px the menu opens from the left (`left: 0`) and stays within `100vw − 32px`.                                                                                                                                                                                                                                  |
| Sidebar feedback | `src/features/execution/running.tsx` | The Pause and the Resume/Complete forms `broadcast="blocks"`, so Today's outlet shows the result; on other pages the card's change is the feedback.                                                                                                                                                                     |
| Modals           | `src/app/today/page.tsx`             | The `review` and `goal` panels are `variant="modal"`.                                                                                                                                                                                                                                                                   |
| Tighter modal    | `globals.css`                        | The modal root's padding is 12 px, its max height `100dvh − 24px`, and the head and body paddings are smaller; `.row-tabs`, `.row-recorded` and `.row-danger` sit closer. A done block's details with Edit open still scroll by about 40 px on a 700 px screen (650 of 613 px); the Add form and every other modal fit. |

## Tests

No new tests: the changes are layout and panel variants, covered by the browser journeys and axe.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 116 files, 628 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build at 1366×700 and 390, Playwright)

- **Alignment:** both labels at y 368; the field's centre and the 30 min chip's centre both at y 416.
- **Sidebar:** Pause answered "Paused · under a minute so far. Resume when you are ready."; Complete answered "Done. Nothing else is planned today." above the list.
- **Modals:** Review day opened centred (x 423, 520 wide, 503 tall); the goal opened centred.
- **Details with Edit:** 676 px tall on a done block, its body scrolling 650 of 613 px: about 40 px short of fitting, left as is.
- **Phone menu:** x 109 to 309 inside the 390 px screen.
- **Axe:** clean on desktop and phone; no console errors.

## Production

Merge and deploy; there is no database step. Plan my first focus is checked read-only on production, where the owner's account is on its first-run view.
