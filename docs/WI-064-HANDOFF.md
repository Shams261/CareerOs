# WI-064 handoff — The curriculum is the default; goals are the owner's own

Date: 2026-10-28. Branch `feat/wi-064-curriculum` from `main` `52c6f7f` (WI-063). ADR-026.

## Owner's decisions (2026-10-28, during their own UAT)

**Why.** The production wipe took the roadmaps and the 219 practice problems with the workspace. The owner decided two things:

- **The curriculum** (the five roadmaps and the practice problems) belongs to the app and must always be there.
- **Goals** are the owner's own, for any horizon (the next two days, a week, a month), and have nothing to do with the curriculum.

**Migration:** `20261029090000_default_curriculum`. It adds `Roadmap.curriculum` and the `CurriculumBundle` table. Its backfill marks roadmaps holding slugged items as curriculum and unlinks them from their goal.

## What changed

**Publishing.**

- `pnpm curriculum:publish <bundle.json>` (`scripts/publish-curriculum.ts`) validates the bundle and stores it as the single `CurriculumBundle` row, without its goal.
- The bundle stays out of the public repository.
- The bundle's types and checks moved to `src/features/curriculum/bundle.ts`; `scripts/lib/roadmap-bundle.ts` re-exports them.

**Copying.**

- `copyCurriculum(tx, userId, bundle)` (`src/features/curriculum/copy.ts`) creates only what is missing, in bulk: topics by name, problems by URL, roadmaps by title, items by (roadmap, slug).
- It unarchives curriculum roadmaps, shows hidden curriculum problems again, and runs `followPractice`.
- It never updates existing text, marks, attempts, confidence or notes.
- About twenty statements in total.

**First sign-in.** `ensureCurriculum` runs in the sign-in callback when the workspace has no curriculum roadmap and a bundle is published. A failure logs `[curriculum] copy failed <ErrorClass>` and never blocks sign-in.

**Restore.**

- Settings → Data → **Default curriculum** ("5 roadmaps · 219 practice problems") opens a panel with **Restore default curriculum** (`restoreCurriculumAction`, under the owner lock).
- The result names what came back, e.g. "Restored 1 item, 1 archived roadmap."
- The counts are read in SQL, so Settings does not load the bundle.

**Default roadmaps.**

- `deleteRoadmap` refuses them: "A default roadmap is archived, not deleted."
- Their edit panel has no Delete and no Goal field, and the title is read-only. `saveRoadmap` also keeps the name and clears the goal.
- The detail page's eyebrow reads "Default roadmap".

**No goal from the curriculum.** `importBundle` no longer creates the bundle's goal or links roadmaps to one, and it marks roadmaps as curriculum. The CLI no longer prints `Goal:`.

**Goals.**

- `TargetDateField` (`src/features/goals/target-date.tsx`) offers quick picks: In 2 days, This week, This month, or the date field. The dates come from `quickTargets` (`src/features/goals/horizon.ts`).
- The short goal form (new goals on Today and Roadmap) drops the category field.
- Today's goal line starts with `horizonLabel`: "This week · Finish Arrays & Hashing · 4 days left".
- The Roadmap header always offers Set a goal, Edit goal or Goals.
- The goal card above the Roadmap is gone.

**Docs.**

- ADR-026.
- The security log vocabulary: `[curriculum] copy failed` and `[curriculum] restore failed`.
- Operations: the publish step.
- CLAUDE.md: a new invariant and the new command.
- CHANGELOG.

## Tests

| File                                    | What it checks                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/curriculum-database.test.ts`     | **First copy:** everything is created as curriculum, with no goal. **Second copy:** creates nothing. **Restore:** brings back a deleted item, an archived roadmap and a hidden problem, and keeps a Done item's status and notes. **Delete:** a default roadmap cannot be deleted. **First sign-in:** a new workspace gets the copy, and only once. |
| `tests/curriculum-migration.test.ts`    | Imported roadmaps become curriculum without a goal. An owner-made roadmap keeps its goal, and the goal row stays.                                                                                                                                                                                                                                   |
| `tests/goal-horizon.test.ts`            | The quick picks, including on a Sunday, in December and in February, and the horizon labels.                                                                                                                                                                                                                                                        |
| `tests/roadmap-import-database.test.ts` | The import now creates no goal and marks curriculum. This follows the owner's decision.                                                                                                                                                                                                                                                             |
| `tests/goal-role-migration.test.ts`     | It asserted that its migration was the newest. It now checks that its migration is present, as the other migration tests do.                                                                                                                                                                                                                        |
| `src/server/health.ts`                  | `LATEST_MIGRATION` is the new migration.                                                                                                                                                                                                                                                                                                            |

## Gate

- `prisma format`, `pnpm typecheck` and ESLint are clean.
- `pnpm test:ci` on a fresh disposable database: 110 files, 600 tests.
- `db:deploy` on a fresh database is clean, and `prisma migrate diff` reports no difference.
- Seed run twice; `verify-seed` passes on all 28 tables.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, empty database)

1. **Publish and first sign-in.**
   - `pnpm curriculum:publish` printed 5 roadmaps, 219 problems and 16 topics.
   - The first sign-in copied the curriculum: the Roadmap showed the five roadmaps at 0 done.
2. **A goal set from the Roadmap header.** Set a goal → "This week" filled 2026-11-01 (the Sunday). The header read "Finish Arrays & Hashing · 4 days left".
3. **Restore.**
   - Deleted one item and archived System design in the database.
   - Settings → Restore answered "Restored: … 1 item … 1 shown again" before the wording change. The new wording is covered by the action's code, not re-run in the browser.
4. **A default roadmap's page.** The eyebrow reads "Default roadmap". The title is read-only, with no Goal field and no Delete.

**Not in this item.** The first-login Today, where a new account has nowhere to set a goal yet, is WI-065.

## Production (owner-run, in this order)

1. **Verified backup.** `db:backup`, then `db:restore:verify` on Docker PostgreSQL 17.
2. **`pnpm db:deploy` against Supabase.** It adds the column and the table, marks the five imported roadmaps as curriculum, and unlinks them from "Offer from a product company". The goal stays; delete it in Goals if it is not yours.
3. **`pnpm curriculum:publish "<Mission Stripe folder>/roadmap-bundle.json"`** against Supabase.
4. **Merge and deploy.** `/api/health` reports `schema: current` once both are done.
