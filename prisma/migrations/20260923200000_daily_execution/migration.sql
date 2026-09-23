ALTER TABLE "DailyPlan" ADD COLUMN "generatedAt" TIMESTAMPTZ(3);
-- Existing plans are snapshots: preserve their blocks until explicitly changed.
UPDATE "DailyPlan" SET "generatedAt" = CURRENT_TIMESTAMP;
ALTER TABLE "TimeBlock" ADD COLUMN "occurrenceDate" DATE,
 ADD COLUMN "isOverride" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "skipReason" TEXT;
UPDATE "TimeBlock" b SET "occurrenceDate" = p.date FROM "DailyPlan" p WHERE b."dailyPlanId" = p.id AND b."routineKey" IS NOT NULL;
-- WI-001 did not track override provenance; conservatively protect all legacy blocks.
UPDATE "TimeBlock" SET "isOverride" = true;
DROP INDEX "TimeBlock_dailyPlanId_routineKey_key";
CREATE UNIQUE INDEX "TimeBlock_routineKey_occurrenceDate_key" ON "TimeBlock"("routineKey", "occurrenceDate");
ALTER TABLE "RoutineBlock" ADD COLUMN weekdays INTEGER[] NOT NULL DEFAULT '{}', ADD COLUMN description TEXT, ADD COLUMN priority INTEGER NOT NULL DEFAULT 2;
UPDATE "RoutineBlock" SET weekdays = ARRAY[weekday];
DROP INDEX "RoutineBlock_userId_weekday_enabled_idx";
ALTER TABLE "RoutineBlock" DROP COLUMN weekday;
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "routine_weekdays" CHECK (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]);
CREATE INDEX "RoutineBlock_userId_enabled_idx" ON "RoutineBlock"("userId",enabled);
ALTER TABLE "DailyCheckIn" ADD COLUMN "carryForward" TEXT;
-- Fail rather than silently discard any pre-existing duplicate open sessions.
CREATE UNIQUE INDEX "one_running_session_per_user" ON "ActualSession"("userId") WHERE "endedAt" IS NULL;
