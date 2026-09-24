-- WI-002 added weekdays with DEFAULT '{}' only to backfill existing rows before its
-- CHECK (cardinality 1..7). An empty default can never satisfy that check and every
-- writer supplies weekdays, so the default is removed rather than declared in Prisma.
ALTER TABLE "RoutineBlock" ALTER COLUMN "weekdays" DROP DEFAULT;
