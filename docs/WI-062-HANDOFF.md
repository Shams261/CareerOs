# WI-062 handoff — Wrap-up fixes

Date: 2026-10-28. Branch `feat/wi-062-fixes` from `main` `82f9133` (WI-061).

**Source.** The wrap-up audit of 2026-10-28 found these bugs:

- a read of the code for WI-058 to WI-061;
- a capture of every screen: light and dark, 1440 and 375, Chromium and WebKit.

The owner chose to fix the bugs now (this item) and to decide the UI simplification separately.

**Migration:** none.

## What changed

| #   | Bug                                                                                                                                                                                                                                                                                                                                                                                                | Fix                                                                                                                                                                                                               | Where                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | `next build` compiles `memo.ts` once per webpack layer. The build had module 9473 for pages and 64454 for actions imported by client components. An action's `forgetAll` cleared its own empty map, so the page snapshot stayed. WI-061 turned 20 seconds of staleness into 3 minutes. Affected: Undo, Dismiss on Rumi noticed, Mark revised in the deck, notes, nudges, Rumi, prep and reminders. | The map and the listener set live on `globalThis` (`silsilaSnapshots`, `silsilaForgetListeners`), as the session cache already did. In the new build every copy reads the shared map.                             | `src/server/memo.ts`                                    |
| 2   | The chat's handover listener held the `send` from the first render. In the drawer, which stays mounted since WI-060, a second "Ask Rumi · …" started a new conversation. A handover during an answer sent twice.                                                                                                                                                                                   | `take` reads the latest render through a ref. A question that arrives while an answer is coming stays in storage, and is taken when the answer ends.                                                              | `src/features/agent/chat.tsx`                           |
| 3   | The session cache kept every well-formed token, unknown ones included, and never evicted them.                                                                                                                                                                                                                                                                                                     | Only real sessions are kept. Expired entries go on each insert, and the map is capped at `SESSION_CACHE_MAX` = 50.                                                                                                | `src/server/session.ts`                                 |
| 4   | Snapshot keys that depend on the date had no day in them, so after midnight a page read yesterday's snapshot.                                                                                                                                                                                                                                                                                      | The keys carry `dayKey(now, user.timezone)`. Affected keys: `for-today`, `jobs`, `jobs-today`, `jobs-funnel`, `learning`, `noticed`, `roadmap-list`, `roadmap-revision`, `goals`, `chain`, `week-plan`, `review`. | the services                                            |
| 5   | Turning notifications on or off did not clear the snapshots, so the setup step stayed open.                                                                                                                                                                                                                                                                                                        | `forgetAll()` in the push actions.                                                                                                                                                                                | `src/features/push/actions.ts`                          |
| 6   | Undo of a deleted session ran outside the owner lock. It also lost the links from attempts and learning activities, which are set to null on delete.                                                                                                                                                                                                                                               | `deleteSession` returns the linked attempt and activity ids. `restore-session` runs under `locked()` and links those rows again, if they are still the owner's and still unlinked.                                | `src/features/deletes/`, `src/features/undo/service.ts` |
| 7   | Rumi's round button sat on the page's last row.                                                                                                                                                                                                                                                                                                                                                    | `.content` gets 104 px of bottom padding (148 px on a phone) whenever the button is shown.                                                                                                                        | `src/app/globals.css`                                   |

Also in this item:

- `src/components/progress-bar.tsx` had no importers and is removed.
- **CLAUDE.md:**
  - the Google app is In production (since 2026-10-24), Calendar is connected, and push is on two devices;
  - the WI-012 runbook was replaced by WI-045;
  - the latest work item and handoff are updated.
- **ADR-017** has a WI-062 amendment.

## Tests

| Test                             | What it checks                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/memo.test.ts`             | A second copy of the module, loaded with `vi.resetModules`, shares the cache, and `forgetAll` from either copy clears it. Before this fix the test fails. |
| `tests/sessions.test.ts`         | An unknown token leaves the session cache unchanged.                                                                                                      |
| `tests/deletes-database.test.ts` | An attempt recorded from a session is linked again after delete and Undo.                                                                                 |

## Gate

- `pnpm typecheck` passes.
- ESLint is clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 106 files, 590 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification

Checked on the production build:

- **Shared cache.** Every compiled copy of the snapshot cache reads `globalThis.silsilaSnapshots`; no module-local map remains.
- **Undo is fresh.** In a browser:
  1. Opened a roadmap detail page twice, so its snapshot was warm.
  2. Removed an item, then pressed Undo. The database had the item again.
  3. Reloaded. The page showed the item at once.
- **Room for the round button.** `.content` ends with 104 px of padding at 1440 and 148 px at 375.
- **Console.** No errors.

## Not in this item

The UI simplification proposals from the audit are a separate item, after the owner chooses:

- one "Next" list per page;
- a lighter Today header;
- Study and Notes tabs on a roadmap item;
- plain words for confidence;
- a lighter application page;
- the sidebar note box.

## Production

Merge and deploy. There is no database step.
