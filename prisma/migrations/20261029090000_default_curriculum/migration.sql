-- WI-064: the default curriculum. Roadmaps that came from the bundle (they hold items with an
-- import slug) are marked as curriculum and no longer tied to a goal: the curriculum has no
-- relation to the owner's goals, which the owner sets for any horizon.

-- AlterTable
ALTER TABLE "Roadmap" ADD COLUMN     "curriculum" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CurriculumBundle" (
    "id" TEXT NOT NULL,
    "builtAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CurriculumBundle_pkey" PRIMARY KEY ("id")
);

-- Backfill: imported roadmaps become curriculum, without a goal.
UPDATE "Roadmap" r
SET "curriculum" = true, "goalId" = NULL
WHERE EXISTS (
  SELECT 1 FROM "RoadmapItem" i WHERE i."roadmapId" = r."id" AND i."slug" IS NOT NULL
);
