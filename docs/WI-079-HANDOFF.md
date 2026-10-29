# WI-079 handoff — Needs attention as a rail card

Date: 2026-10-29. Branch `feat/wi-079-attention-card` from `main` `5d912b4` (WI-078).

**Source.** The owner compared production with the V1 mockup again and asked where the rings were and why Needs attention did not look like the mockup's card. On production the rings card had not appeared because no session on the day had a whole minute; I ran a one-minute session on a test block ("UAT check: rings"), left it in place for the owner to see, and "Today so far · 1 session · 1 min of recorded work" showed. Needs attention was a plain heading in the rail while This week and Today so far were cards.

**Migration:** none.

## What changed

| Part     | Where                                   | What                                                                                                                                                                                                          |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The card | `src/app/today/page.tsx`, `globals.css` | The attention boundary, skeleton and list sit in `section.card.rail-card`; the heading is 18 px like This week's, and the empty line reads at 14 px. The setup steps and the nudges card below are unchanged. |

## Tests

No new tests: a wrapper and styles; the journeys and axe cover the page.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 118 files, 635 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification

- Local production build: axe clean at 1366×700 in light and dark and at 390×844.
- Production, in the owner's Chrome: the test block "UAT check: rings" (17:30, done, 1 min recorded) stays on the day so the rings card can be seen; the owner may delete it from its ⋯.

## Production

Merge and deploy; there is no database step.
