# WI-027 — Focus session core

Date: 2026-10-25. Branch `feat/wi-027-focus-session` from `main` `17946ae`. The first slice of the Version 2 plan (`docs/product/v2-plan.md`, section 10; ADR-021).

## Outcome

- **Start opens Focus.** Every Start on Today (the launcher, the agenda row, the row's More menu and the `S` shortcut) now goes to `/focus?block=<id>`. Focus shows the block, its planned window and an optional one-line **Intention** (≤140 characters); **Begin** runs the existing start action. The owner can still go back to Today without starting anything.
- **The ring.** While the session runs, a teal ring drains toward the block's planned end. A late start gets the block's planned length from its own start; an unlinked session shows an untimed ring with the time so far. The time left is read out politely at most every five minutes. A refresh keeps the same ring, because it is drawn from the running session's start time and the block's planned window.
- **Time up.** The ring closes, "Time is up" replaces the countdown, and **What did you learn?** (≤200 characters) opens and takes focus. If **Chime at the end** is on (a `silsila-focus-chime` cookie, off by default), two soft synthesised notes play once. Nothing completes on its own. Enter completes; Stop and Complete run the existing actions and return to Today.
- **Words on the record.** The intention and the learned line are appended to the session's existing `ActualSession.notes` as `Intention: …` and `Learned: …`. Existing text is never replaced, and empty lines add nothing. No migration.
- **Where the browser allows it.** **Pop out** (Document Picture-in-Picture: Chrome and Edge 116+ on desktop) puts the ring in a small window over the editor. **Keep screen on** (Screen Wake Lock) is on by default in Focus. Either control is absent where the API is missing. If a browser exposes Picture-in-Picture but cannot open the window, a calm line says so.
- **Getting back to Focus.** The launcher shows Focus beside Stop session while a session runs, and the shell's running strip has a Focus link on every page. Esc returns to Today; the timer keeps running.
- **Fixed:** the running strip was an `<aside>` inside the sidebar `<aside>` (axe `landmark-complementary-is-top-level`). It is now a labelled section.
- **Fixed (separate commit):** `tests/production-database.test.ts` had started failing on 2026-10-24 on every branch. Its fixed clock (2026-09-24) plus 30 days put `expiresAt` before the database-default `createdAt`, which `Session_expiry_check` rejects. `createSession` now writes `createdAt` from the same clock as `expiresAt` and `lastSeenAt`. In production the clock is the real time, so behaviour is unchanged.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/app/focus/page.tsx`, `src/features/execution/focus.tsx`, `src/features/execution/focus-domain.ts`, `src/lib/sound.ts`, `src/lib/wake-lock.ts`, `tests/focus-domain.test.ts`, `docs/product/v2-plan.md`, `docs/screenshots/wi-027/`                                                                                                                                                                                                                                                                                            |
| Changed | `src/server/session.ts` (`createdAt` from the injected clock), `src/features/execution/service.ts` (`execute` takes optional intention and learned lines), `src/features/schedule/actions.ts` (passes them; revalidates `/focus`), `src/features/schedule/forms.tsx` (Start links to Focus; Focus beside Stop session in the launcher), `src/features/execution/running.tsx` (Focus link, section landmark), `src/app/globals.css`, `tests/execution-database.test.ts`, docs (ADR-021, brand system, CHANGELOG, CLAUDE.md, README) |

There are no migrations and no new dependencies. Focus reads at most two statements, the running session and one block. Today's queries are unchanged, because Start is now a link.

## Verification

| Check                                                               | Result                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `typecheck`, `build`, `docs:check`, `git diff --check` | See the PR; run on a clean export of the branch                                                                                                                                                                                                                                              |
| `pnpm test:ci` (disposable database)                                | New `tests/focus-domain.test.ts` (target, ring, minutes, words, notes) and a database case: the intention is kept at start, the learned line is appended at complete, plain start and stop leave notes empty, and an over-long intention is refused                                          |
| Browser, 1440 light                                                 | `S` on Today opens Focus. Begin starts one session. The ring drains. At the target the chime played once (two oscillators) and the learned field opened with focus. Enter completed, notes were saved as `Intention: …\nLearned: …`, the block was Completed, and the page returned to Today |
| Browser, 390 and dark                                               | No horizontal overflow. Stop and Complete are 48 px. The dark theme renders the ring in the dark accent                                                                                                                                                                                      |
| Console                                                             | No errors on a clean tab: a hydration mismatch on the ring was fixed by starting the clock at the server's render time                                                                                                                                                                       |
| axe-core 4.10 on Focus                                              | One finding, the nested running strip landmark, which is now fixed. A re-run was not possible in this session                                                                                                                                                                                |

## Owner checks (not possible here)

1. **Pop out in desktop Chrome.** The embedded browser exposes the API but cannot open windows ("no window"), so the pop-out was not seen working. In Chrome, run Focus and press Pop out. The ring should appear in a small window and keep ticking.
2. **Keep screen on in the iPhone Home Screen app.** WebKit marks the installed-app bug fixed, but the version is unconfirmed. Start Focus on the phone and leave it untouched for a few minutes.
3. **Chime volume on the phone.** iOS may follow the silent switch on older versions.

## Limitations

- Focus does not set its own target length yet, for example a 20-minute session from a nudge. That arrives with Study Nudges (WI-028).
- Ambient sound, completion sounds elsewhere and view transitions are Phase 4 hypotheses (plan section 6), not part of this slice.
