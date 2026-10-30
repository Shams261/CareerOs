# WI-090 handoff — the final roadmap check's notes and a scoping test

Date: 2026-10-30. Branch `fix/wi-090-roadmap-notes` from `main` `ab3018a` (WI-089).

**Source.** Before moving to Practice the owner asked for one last security and function pass on the roadmap (`output/Silsila-Roadmap-Final-Check.pdf`, not committed): a four-case owner-scoping probe through the services with two users, 20 browser checks (signed-out access, headers and the cookie, hostile input in every field and address, `javascript:` links, the flows the audit had not walked) and the two regression scripts. No security finding; two notes, both approved for a fix, and the probe kept as a test.

**Migration:** none.

## What changed

| #   | Was                                                                                                                       | Now                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | The `?` overlay listed ← → only when both neighbouring weeks existed, so the first and last week showed no arrow row.     | `PageShortcuts` lists ← →, ← or → for whichever exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N2  | An unknown or foreign id on `/roadmap/[id]`, `/jobs/[id]` and `/dsa/[id]` showed "That page is not here" with status 200. | Kept as is, and understood: Next 16 streams the shell and the metadata before `generateMetadata` resolves, so even `notFound()` there cannot change the status for a browser (HTML-limited bots do get a 404). Blocking the stream app-wide (`htmlLimitedBots: /.*/`) would cost TTFB on every page for a status code nobody reads; the not-found page itself is right and nothing leaks. The three pages now call `notFound()` from `generateMetadata` anyway (correct for bots) and name their record in the tab: "Wealthsimple · Jobs", "Contains Duplicate · Practice". |
| T   | The owner-scoping probe lived in the scratchpad.                                                                          | `tests/roadmap-security.test.ts`: another owner's item, roadmap and card are refused on every write; a tampered Undo (`restore-roadmap-state`, `restore-roadmap-item`, `restore-card`, an unknown kind) is refused; a link to another owner's topic is refused; non-https links and an over-long section are rejected by validation.                                                                                                                                                                                                                                        |

## Gate

- `pnpm typecheck` and ESLint clean; Prettier clean on changed files.
- `pnpm test:ci` on a fresh disposable database; `pnpm build`; `pnpm test:e2e` and `pnpm test:e2e:safari`; `pnpm docs:check`; `git diff --check`.
- On the local build: the overlay lists → on Week 1 and ← → on Week 2; the Practice and Jobs tabs name their record; a foreign id still shows the not-found page (status 200 by design, see N2).

## Production

Merge and deploy; there is no database step.
