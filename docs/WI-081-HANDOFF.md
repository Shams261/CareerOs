# WI-081 handoff — Start 20 min and refusals as toasts

Date: 2026-10-29. Branch `fix/start-pick-overlap` from `main` `eeb4769` (WI-080).

**Source.** The owner pressed Start 20 min on Today and read "Overlap: UAT check: rings (Oct 29, 17:30–18:00). Check 'Allow this overlap' to proceed intentionally." The block in the way was done. The owner then asked that such a refusal come as a toast rather than a line squeezed into the card.

**Migration:** none.

## What changed

| Part           | Where                                                                                                                                            | What                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start 20 min   | `src/features/for-today/service.ts`                                                                                                              | `startPick` looks for a block still `PLANNED` or `IN_PROGRESS` over the next twenty minutes; if there is one it refuses by name ("X is planned for 17:30–18:00. Start that block, or move it first."); otherwise it saves with `allowOverlap`, so a done or skipped block's slot no longer blocks a quick start.                                                                                                                              |
| Toasts         | `src/components/toast.tsx`, `src/components/action-form.tsx`, `src/app/layout.tsx`, `globals.css`                                                | `publishToast(message)` and `dismissToast(id)` feed a store; `ToastHost` (in the layout after the command bar) renders at most three toasts fixed at the bottom centre, each `role="alert"` with a ×, gone by itself after seven seconds, all cleared by Escape, rising under `prefers-reduced-motion: no-preference`. `ActionForm toast` publishes a refusal (`ok: false` with a message and no preview) there and leaves no inline message. |
| Where it is on | `src/features/today/launcher.tsx`, `src/features/schedule/forms.tsx` (`ExecutionControls` when `launcher`), `src/features/execution/running.tsx` | Start 20 min, Stop session, the launcher's Start session / Resume / Complete, and the sidebar card's Pause / Resume / Complete. Row forms keep their inline messages and the `blocks` outlet.                                                                                                                                                                                                                                                 |
| Phone rows     | `globals.css` (`@media (max-width: 700px)`, `.agenda.is-compact`)                                                                                | The compact row is two columns on a phone and its side (`.agenda-side`) takes the second row under the title, wrapping. Before, the WI-078 three-column row kept the side on the title line, so a past row's "Not recorded · Log time · Reschedule · ›" squeezed the title to a letter a line and pushed the page 67 px sideways.                                                                                                             |

## Tests

- `tests/start-pick-database.test.ts` (new, database): a done block over the next twenty minutes lets Start 20 min through, and the new block starts now; a planned block refuses with its name and times, and nothing is written.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 119 files, 637 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright, Chromium)

- A stale Today tab (another context had started a block) pressed Start session: the toast read "Another session is running. Pause or complete it first." at the bottom centre (480 px wide at 1366), `role="alert"`, no inline message in the launcher, axe clean; × removed it; a second press showed it again and it went by itself within eight seconds; no console errors.
- On a 390 px phone the toast sat above the bottom bar (its bottom at 764 of 844) with no page overflow from it.
- The phone overflow that remained came from the past rows: after the fix a Not recorded row at 390 px is 131 px tall with its title at full width and its side under it, the page has no overflow, axe is clean; at 1366 the row is unchanged (68 px, the side on the title line).

## Production

Merge and deploy; there is no database step. The owner's Start 20 min over the done "UAT check: rings" block then starts a new block.
