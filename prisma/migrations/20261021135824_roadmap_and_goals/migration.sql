-- CreateEnum
CREATE TYPE "RoadmapItemKind" AS ENUM ('CONCEPT', 'QUESTION');

-- CreateEnum
CREATE TYPE "RoadmapItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "Roadmap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goalId" TEXT,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "kind" "RoadmapItemKind" NOT NULL DEFAULT 'CONCEPT',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "url" TEXT,
    "status" "RoadmapItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMPTZ(3),
    "askedInInterview" BOOLEAN NOT NULL DEFAULT false,
    "askedNote" TEXT,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "learningTopicId" TEXT,
    "dsaProblemId" TEXT,
    "dsaTopicId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Roadmap_userId_ordering_idx" ON "Roadmap"("userId", "ordering");

-- CreateIndex
CREATE INDEX "RoadmapItem_roadmapId_section_ordering_idx" ON "RoadmapItem"("roadmapId", "section", "ordering");

-- CreateIndex
CREATE INDEX "RoadmapItem_userId_status_idx" ON "RoadmapItem"("userId", "status");

-- CreateIndex
CREATE INDEX "RoadmapItem_learningTopicId_idx" ON "RoadmapItem"("learningTopicId");

-- CreateIndex
CREATE INDEX "RoadmapItem_dsaProblemId_idx" ON "RoadmapItem"("dsaProblemId");

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_learningTopicId_fkey" FOREIGN KEY ("learningTopicId") REFERENCES "LearningTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_dsaProblemId_fkey" FOREIGN KEY ("dsaProblemId") REFERENCES "DsaProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_dsaTopicId_fkey" FOREIGN KEY ("dsaTopicId") REFERENCES "DsaTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
