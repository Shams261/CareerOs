# WI-118 handoff: four more Rumi cards

Date: 2026-11-01. From the Rumi audit (E4): Rumi could not mark a roadmap item, add an application or an interview round, or set a goal; the owner had to leave the chat for each. No migration.

## What changed

- **Four cards** (ADR-030 class B, `requestArgs` in `src/features/agent/request-domain.ts`), each shown by Rumi and applied only by the owner's press, re-checked under the owner lock, with Undo:

| Card                               | What the press does                                       | Refused when                                                                                           | Undo                    |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------- |
| `mark_item` (item started or done) | `applyItemOpIn`; done starts the 7-day revision           | the item follows Practice (a `log_attempt` card marks it), it is already so, it changed since the card | `restore-roadmap-state` |
| `add_application`                  | `createApplicationIn` (saved or applied, the day applied) | the same company and role is already in Jobs; a future applied day                                     | `remove-application`    |
| `add_round`                        | `scheduleRoundIn` (type, day, start, end, title)          | the application is closed or its stage changed; the time has passed; the end is before the start       | `remove-round`          |
| `set_goal`                         | `saveGoalIn` (title, target date, role; category Career)  | the target date has passed                                                                             | `remove-goal`           |

- **`find_items`**: a read over the owner's Study AI roadmaps (up to eight items whose title holds every word, with their id, roadmap, section and status, never their notes), so a card can name an item; `itemId` joins the ids a read may give.
- The services are split into in-lock versions (`applyItemOpIn`, `saveGoalIn`, `createApplicationIn`, `scheduleRoundIn`); the pages keep calling the locked ones unchanged.
- The prompt names the new cards, and a record may come from the page Rumi was opened on (WI-117).

## Tests

`tests/agent-cards.test.ts`: an item found and marked done with one press and its revision started, Undo putting it back, a Practice-linked item refused; an application and a round added and removed by Undo, a duplicate application refused; a round on a closed application or at a passed time refused, and an unseen application id refused; a goal set and removed, a passed target date refused. `tests/agent-database.test.ts` runs the new tools through the never-read check. `e2e/journeys.spec.ts`: "Rumi adds an application on a card, and Undo removes it" (the fake model learned the application card).

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari (16 each), docs:check, `git diff --check`.

## Next

The last audit item: Rumi's answer streams in as it is written.
