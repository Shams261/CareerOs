-- AlterTable
ALTER TABLE "RoadmapItem" ADD COLUMN     "lastRevisedAt" TIMESTAMPTZ(3),
ADD COLUMN     "nextRevisionAt" DATE,
ADD COLUMN     "revisionStage" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "RoadmapItem_userId_nextRevisionAt_idx" ON "RoadmapItem"("userId", "nextRevisionAt");

