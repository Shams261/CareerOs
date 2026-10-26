# WI-035: Ambient sound in Focus

Date: 2026-10-26. Branch `feat/wi-035-focus-sound` from `main` `c5651bc` (WI-034). This is the third Version 2 Phase 4 hypothesis (`docs/product/v2-plan.md`, section 6): "sound helps start". The test is that sound is used in at least half of Focus sessions over two weeks. No migration, no AI, and nothing leaves the device.

## Outcome

A running Focus session shows **No sound · Rain · Brown noise** under the ring, as in the concept `focus.jpg`.

- **Off by default.** The choice saves on tap, like the theme switch, in the cookie `silsila-focus-sound` (`off`, `rain` or `brown`; no personal content), and applies to the next session too.
- **Synthesised, no files.** `src/lib/ambient.ts` builds the sound with Web Audio on the same AudioContext as the WI-027 chime (`audioContext()` in `src/lib/sound.ts`), so it works offline.
  - Brown noise is a leaky random walk.
  - Rain is pink noise without its rumble or sharpest hiss, swelling slowly.
  - Each is an eight-second buffer with its seam blended so the loop has no click (`seamlessLoop`).
- **Calm.** It fades in and out over about a second, at a low level (gain 0.12) that sits under the chime. Switching sounds crossfades.
- **Only after a gesture.** After Begin, sound starts at once, because the tap on Begin unlocked audio. After a reload, audio is still locked, so it waits for the next tap or key instead of starting a context without a gesture. This means there is no autoplay warning (`audioRunning()`).
- **Time up.** The sound fades out when the ring closes, so the chime and "What did you learn?" stand out. Choosing a sound again after that plays it.
- **Leaving.** Stop, Complete, Esc or any navigation away from Focus fades it out.

**Measuring the hypothesis.** It uses no new store, following ADR-021.

- The sounds that actually played are kept for the tab (`sessionStorage`, per session id, so a reload keeps them).
- Stop or Complete sends them with the form. The server appends one line to the session's notes after the learned line: `Sound: Rain` or `Sound: Rain, Brown noise` (`soundsLine`, `appendNote`).
- A session with no sound gets no line, exactly as before.
- The two-week check is a count over `ActualSession.notes`: sessions with a `Sound:` line against all Focus sessions.

**Limit.** An unlinked session (Focus without a block) can play sound, but its stop records no sound line, because that stop writes no notes.

## Changes

| Area    | Files                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New     | `src/lib/ambient.ts`, `tests/focus-sound.test.ts`, `docs/screenshots/wi-035/`                                                                                                                                                              |
| Changed | `src/lib/sound.ts` (`audioContext`, `audioRunning`), `src/features/execution/{focus.tsx,focus-domain.ts,service.ts}`, `src/features/schedule/actions.ts` (passes `sound`), `src/app/globals.css`, `tests/execution-database.test.ts`, docs |

`focus.tsx` keeps both Focus cookies (chime and sound) through one small `cookieChoice` helper. The chime cookie's name and values are unchanged.

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree. `pnpm test:ci`: 68 files, 435 tests                                                                                                                                                                                                          |
| Tests                                    | Domain 4: sound names in a fixed order with unknown values dropped, the Sound line appended, both loops within range with no step at the seam larger than any inside, brown darker than pink. Database 1: "Learned: …" then "Sound: Rain, Brown noise"; no sound gives no line       |
| Browser, desktop light                   | Begin, then Brown noise: the cookie and the tab's played list updated. Rain, then a reload: Rain and the chime were restored, with no autoplay warning or console error. Stop with a learned line stored `Learned: Monotonic stack keeps candidates` then `Sound: Rain, Brown noise` |
| Browser, 375 and dark                    | Three 44px options in one row, no overflow; dark tokens as expected; a second session stored `Sound: Rain`                                                                                                                                                                           |

Screenshots: `docs/screenshots/wi-035/`. Listening was not tested by ear in the automated browser. The owner should listen to both sounds once after the deploy.

## Owner steps

None to deploy: there is no migration. After the deploy, open Focus on a block, pick Rain or Brown noise, and listen once. For two weeks, use it or not as you like. Then count the `Sound:` lines.
