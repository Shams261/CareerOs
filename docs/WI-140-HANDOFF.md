# WI-140 handoff: an index and no unused exports

Date: 2026-11-02. These are the two items WI-139 left, done now at the owner's request: the data is not real yet, so the index's migration carries almost no risk. The UX work item becomes WI-141.

## What changed

- **Migration `20261107000000_time_block_plan_index`:** `CREATE INDEX "TimeBlock_dailyPlanId_plannedStart_idx" ON "TimeBlock"("dailyPlanId", "plannedStart")`, and `@@index([dailyPlanId, plannedStart])` in the schema.
  - `TimeBlock` had no index on its plan since WI-002's migration (`20260923200000_daily_execution`) dropped `TimeBlock_dailyPlanId_routineKey_key`. Every read of a day's blocks (Today, Plan, Close the Day, reminders) scanned the table.
  - The migration is expand-only: one index, no data touched.
  - `LATEST_MIGRATION` in `src/server/health.ts` names it.
  - `tests/time-block-index-migration.test.ts` applies every earlier migration, adds a block, applies this one, and checks the block is unchanged, the index exists and the planner uses it.
- **No unused exports.** `knip --fix` removed the `export` keyword from the 136 exports and 28 exported types that nothing outside their file used (tests and scripts count as users).
  - Then the declarations that nothing used at all were deleted: `AuditReport`, `Rung`, `PARTS`, `Undo`, `Tx`, Today's re-exports of four attention and schedule names, and `AttentionSource`. `itemStatuses` became the `ItemStatus` union it was only used for.
  - 70 files; typecheck and every test unchanged.
- **knip now fails CI on new unused code.** Since the count is zero, the Quality step drops `--no-exit-code`. An export, file or dependency that nothing uses fails the build.

## Checks

- Fresh `db:deploy` on a new database.
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: no difference.
- The upgrade test above.
- The seed run twice, and `verify-seed.ts` idempotent across 28 tables.
- Then the full gate.

## Owner step, before the merge

The migration has to be on the production database before `main` deploys. Otherwise the new code's health check reads `schema` as behind and Render does not switch to it. Production is read-only for Claude, so:

1. **Backup:** Actions → Backup → Run workflow, and wait for it to be green.
2. **Apply**, from this branch's checkout (the URL from your own secret store, never in chat):

   ```sh
   DATABASE_URL='<Supabase session-pooler URL>' DATABASE_SSL=no-verify pnpm db:deploy
   ```

   It should print that one migration was applied. An index on a small table takes about a second. The running app keeps working, since it only adds an index.

3. Say so. The branch is then merged, CI runs, and Render deploys. `/api/health` then reads `schema: current`.

## Gate

prettier, `prisma format`, lint, typecheck, `test:ci --coverage` on a fresh database, build, `test:e2e` and `test:e2e:safari`, docs:check, `git diff --check`. The branch is pushed and green before the merge. Results at merge.
