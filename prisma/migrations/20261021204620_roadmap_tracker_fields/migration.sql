-- AlterTable
ALTER TABLE "Roadmap" ADD COLUMN     "promptTemplate" TEXT,
ADD COLUMN     "scenarios" JSONB;

-- AlterTable
ALTER TABLE "RoadmapItem" ADD COLUMN     "checkpoint" TEXT,
ADD COLUMN     "estimateMinutes" INTEGER,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "references" JSONB,
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "sourceRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItem_roadmapId_slug_key" ON "RoadmapItem"("roadmapId", "slug");

