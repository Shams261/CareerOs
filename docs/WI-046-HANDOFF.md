# WI-046 handoff — one truth for problems

Date: 2026-10-27. Branch `feat/wi-046-one-truth` from `main` `cbec85b` (WI-045). This is the third P0 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, section 5): every DSA problem lived on the roadmap and in Practice, each with its own status and revision date. Decision: [ADR-025](architecture/decisions.md). No migration.

## What changed

**The rule.** A roadmap item linked to a `DsaProblem` follows Practice.

| Practice                   | Roadmap item                         |
| -------------------------- | ------------------------------------ |
| No attempt                 | Not started                          |
| Any attempt, Red or Yellow | In progress (`completedAt` cleared)  |
| Green                      | Done (`completedAt` = first Green)   |
| Revision date and stage    | none on the item; the problem's only |

`practiceStatus` and `followPractice` live in `src/features/roadmap/follow.ts`. That file uses relative imports only, because the import script runs it outside Next.js. `followPractice(tx, userId, { problemId? itemId? })` writes only items that differ and never touches Practice. It runs inside:

- `recordAttempt` (`src/features/dsa/service.ts`), under the owner lock with the attempt;
- `saveItem` (`src/features/roadmap/service.ts`) when the item links a problem. A typed "Revise on" is ignored for such an item; unlinking keeps the last status;
- the `restore-roadmap-item` undo (`src/features/undo/service.ts`);
- `importBundle` (`scripts/lib/roadmap-import.ts`), once at the end. The report and the CLI line count `problemItemsFollowed`. This is the one status the import may set, since the owner never wrote it.

`applyItemOp` refuses `done`, `start`, `reopen` and `revised` on a problem item. `practiceItemOps` (`asked`, `unasked`, `remove`) still work.

**Roadmap UI** (`src/features/roadmap/item-list.tsx`, `item-form.tsx`):

- The open problem item's primary action is **Record an attempt**, a link to `/dsa/<id>?from=<item>`. Start, Done, Reopen and Revised are not offered.
- The links line reads "From Practice · GREEN · 2 attempts · next revision Nov 3".
- On desktop the row's hover quick button is **Attempt** (`.row-quick-cell`). It stays hidden on phones, like Done.
- Edit hides "Revise on".

**Practice problem page** (`src/app/dsa/[id]/page.tsx`): it now finds the linked roadmap item even without `?from=`, taking the first by creation. It then shows a **Study** section with that item's Copy prompt, scenarios and a link back to its roadmap section. "Back to … on the roadmap" still appears only when the owner came from the roadmap.

**⌘K** (`src/features/command/service.ts`): a problem-linked item no longer adds its own Open row, so "two sum" gives one Practice row. Grill me and Listen for the item stay when named.

## Tests

- `tests/roadmap-follows-practice-database.test.ts`, new, 5 tests:
  - the `practiceStatus` table;
  - link, then Red → In progress, Green → Done with `completedAt` and no item revision, then Yellow reopens. Practice keeps its own revision;
  - Done, Start, Reopen and Revised refused, Asked and Remove kept;
  - unlink keeps the status, and roadmap marks and a typed date apply again;
  - a stale item brought in step for its owner only, and a second pass writes nothing.
- `tests/command-database.test.ts`: a problem item shows once, as its Practice row.

Gate: see the end of this file.

## Browser check (local, `silsila_dev_empty` with the imported curriculum)

- **1440 px:**
  - The Two Sum item showed Record an attempt, Asked in interview and Grill me, with "From Practice · YELLOW".
  - Its problem page showed the Study section with Copy prompt.
  - Saving a Green attempt there turned the item Done, with `completedAt` set and `nextRevisionAt` null, and the problem's revision became Nov 3. The section line went from 1 done to 2 done.
- **390 px:** no horizontal overflow on either page. The open item's actions wrap cleanly. "From Practice" was wrapping, so it is now kept on one line.
- No console errors.

## Notes

- The local seed database still holds problem items left stale before this change (for example, an item marked Not started while its problem has an attempt). They catch up on the next attempt or `roadmap:import`. Production had no progress after WI-045, so nothing there is stale.
- One problem can sit behind several items (Blind 75 and NeetCode lists); all of them follow it.
- No production step: no migration, no data change. Deploy is the usual merge.

## Gate

Lint, typecheck, build and docs check (84 files) pass on an export of the working tree; `pnpm test:ci`: 87 files, 531 tests; `git diff --check` clean.
