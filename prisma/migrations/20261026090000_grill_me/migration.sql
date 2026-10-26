-- WI-031 Grill Me: a Study AI switch per roadmap, the owner's AI setting, a content-free usage ledger and kept revision cards.
-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('GRILL_ITEM');

-- CreateEnum
CREATE TYPE "AiOutcome" AS ENUM ('PENDING', 'OK', 'FAILED');

-- AlterTable
ALTER TABLE "Roadmap" ADD COLUMN     "studyAi" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AiSetting" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "checkedAt" TIMESTAMPTZ(3),
    "blockedAt" TIMESTAMPTZ(3),
    "blockedReason" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL,
    "outcome" "AiOutcome" NOT NULL DEFAULT 'PENDING',
    "durationMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roadmapItemId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "change" TEXT,
    "points" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisionCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RevisionCard_userId_createdAt_idx" ON "RevisionCard"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevisionCard_roadmapItemId_question_key" ON "RevisionCard"("roadmapItemId", "question");

-- AddForeignKey
ALTER TABLE "AiSetting" ADD CONSTRAINT "AiSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionCard" ADD CONSTRAINT "RevisionCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionCard" ADD CONSTRAINT "RevisionCard_roadmapItemId_fkey" FOREIGN KEY ("roadmapItemId") REFERENCES "RoadmapItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ledger values are never negative.
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_amounts_check"
  CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0 AND "costMicros" >= 0 AND ("durationMs" IS NULL OR "durationMs" >= 0));

-- A kept card has three to five points.
ALTER TABLE "RevisionCard" ADD CONSTRAINT "RevisionCard_points_check"
  CHECK (cardinality("points") BETWEEN 3 AND 5);

-- Study AI starts on for imported roadmaps (they have items with an import slug), except the
-- behavioural roadmap, which is built from the owner's own handbook. Owner-made roadmaps stay off.
UPDATE "Roadmap" r SET "studyAi" = true
WHERE r."title" <> 'Behavioural and resume'
  AND EXISTS (SELECT 1 FROM "RoadmapItem" i WHERE i."roadmapId" = r."id" AND i."slug" IS NOT NULL);
