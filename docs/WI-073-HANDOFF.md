# WI-073 handoff — the daily line and one clock

Date: 2026-10-29. Branch `feat/wi-073-daily-line` from `main` `1f11db3` (WI-072). ADR-028.

**Source.** The owner's UAT after WI-072:

- The pop-out and Focus read a second or two apart (19:05 against 19:03).
- Resume from the sidebar on Roadmap or Jobs opened Focus; it should resume where the owner is.
- A daily greeting and a motivational quotation on Today, changing with the part of the day and from day to day, like a new-tab extension they use.

**Causes.** Every countdown ran its own `setInterval(1000)`, each starting at a different point in the second, with the sidebar flooring the seconds while Focus rounded them; hidden windows also have their timers slowed. The sidebar's Resume submitted `action=focus`, which starts and then opens Focus.

**Owner's choices (2026-10-29):** greeting plus quotation with ADR-028; a light tint for the part of the day; the sidebar resumes in place while Today's card opens Focus like Start session.

**Migration:** none.

## What changed

| Part            | Where                                                                                           | What                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One clock       | `src/lib/clock-tick.ts`                                                                         | `onEverySecond(fn, win)` waits for the next whole second, then ticks every second on that window's timers, and restarts on `visibilitychange` and `focus`. `useSecondTick(initial)` wraps it for components.                                               |
| Every countdown | `live.tsx`, `focus.tsx`, `pip.tsx`, `title-clock.tsx`                                           | All tick through the shared clock, and `LiveLeft` and `LiveCountdown` format through `clock()` (rounded) like Focus and the pop-out.                                                                                                                       |
| Resume in place | `src/features/execution/running.tsx`, `src/features/schedule/actions.ts`                        | The sidebar's Resume submits `action=start` (no redirect) and answers "Session running."; Today's card keeps `action=focus`.                                                                                                                               |
| Daily line      | `src/features/today/daily-line.ts`                                                              | `dayPart(hour)`, `greeting(part, name)`, `QUOTES` (ten public-domain quotations per part, attributed) and `dailyQuote(day, part, offset)`.                                                                                                                 |
| On Today        | `src/features/today/daily-line-card.tsx`, `header.tsx`, `src/app/today/page.tsx`, `globals.css` | `DailyLine` at the top of the header on the current day: the greeting, the quotation in italics with its author, and ↻ for another. The header carries `data-part` for a soft gradient from the tokens; switched off, the line hides and removes the tint. |
| Settings        | `src/app/settings/page.tsx`                                                                     | Appearance → Daily line (`DailyLineToggle`, `silsila-daily-line` in localStorage), like the shortcuts toggle.                                                                                                                                              |
| Docs            | `docs/architecture/decisions.md` (ADR-028), CLAUDE.md voice rule                                | The line is Today's second exception to plain facts; a model never writes a quotation.                                                                                                                                                                     |

## Tests

- `tests/daily-line.test.ts`: the part of the day by hour; the greeting by first name or without; one quotation per day and part, ↻ stepping through the whole pool, different days or parts differing; every quotation at most sixteen words, attributed and free of banned words.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 117 files, 632 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build at 1366×700, headed Chromium)

- **Daily line:** "Good afternoon, owner." with "Work is love made visible. — Kahlil Gibran"; ↻ showed the next quotation; axe clean.
- **Toggle:** Settings → Daily line off hid the line and the header's `data-part`; on again restored them.
- **One clock:** four reads 0.7 s apart gave ring, pop-out, sidebar and tab title identical each time (29:04 / 29:04 / 29:04 / 29:04, then 29:03 …). Before the rounding fix the sidebar read one second behind.
- **Resume:** from the sidebar on Roadmap the URL stayed `/roadmap` and the card read "Running · 29:53 left"; from Today's card it opened Focus.
- **Phone 390:** no overflow, axe clean; no console errors.

## Production

Merge and deploy; there is no database step. The greeting uses `User.name` from Google, first word.
