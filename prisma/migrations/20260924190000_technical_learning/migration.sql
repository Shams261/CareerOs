BEGIN;
-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('NOT_STARTED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LearningActivityType" AS ENUM ('LEARN', 'REVIEW', 'PRACTICE', 'INTERVIEW_RECALL', 'MOCK', 'NOTE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TECHNICAL_REVIEW';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentSubjectId" TEXT;

-- AlterTable
ALTER TABLE "LearningTopic" ADD COLUMN     "application" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "interview" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "nextReviewDate" DATE,
ADD COLUMN     "ordering" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recall" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "understanding" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LearningSubject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "SubjectStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "goalId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LearningSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "activityType" "LearningActivityType" NOT NULL,
    "performedAt" TIMESTAMPTZ(3) NOT NULL,
    "understanding" INTEGER,
    "recall" INTEGER,
    "application" INTEGER,
    "interview" INTEGER,
    "statusBefore" "LearningStatus" NOT NULL,
    "statusAfter" "LearningStatus" NOT NULL,
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "actualSessionId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningSubject_userId_status_idx" ON "LearningSubject"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LearningSubject_userId_name_key" ON "LearningSubject"("userId", "name");

-- CreateIndex
CREATE INDEX "LearningActivity_userId_performedAt_idx" ON "LearningActivity"("userId", "performedAt");

-- CreateIndex
CREATE INDEX "LearningActivity_topicId_performedAt_idx" ON "LearningActivity"("topicId", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningActivity_userId_requestId_key" ON "LearningActivity"("userId", "requestId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_currentSubjectId_fkey" FOREIGN KEY ("currentSubjectId") REFERENCES "LearningSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSubject" ADD CONSTRAINT "LearningSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSubject" ADD CONSTRAINT "LearningSubject_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "LearningTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_actualSessionId_fkey" FOREIGN KEY ("actualSessionId") REFERENCES "ActualSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve legacy topic identity, hierarchy, status, notes, goals and resources.
INSERT INTO "LearningSubject" (id, "userId", name, status, "updatedAt")
SELECT 'legacy-learning-' || "userId", "userId", 'Imported learning', 'ACTIVE', CURRENT_TIMESTAMP
FROM "LearningTopic" GROUP BY "userId";
UPDATE "LearningTopic" SET "subjectId" = 'legacy-learning-' || "userId";
ALTER TABLE "LearningTopic" ALTER COLUMN "subjectId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "LearningTopic" ADD CONSTRAINT "LearningTopic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "LearningSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LearningTopic" ADD CONSTRAINT "LearningTopic_understanding_range" CHECK ("understanding" BETWEEN 0 AND 3);
ALTER TABLE "LearningTopic" ADD CONSTRAINT "LearningTopic_recall_range" CHECK ("recall" BETWEEN 0 AND 3);
ALTER TABLE "LearningTopic" ADD CONSTRAINT "LearningTopic_application_range" CHECK ("application" BETWEEN 0 AND 3);
ALTER TABLE "LearningTopic" ADD CONSTRAINT "LearningTopic_interview_range" CHECK ("interview" BETWEEN 0 AND 3);
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_understanding_range" CHECK ("understanding" BETWEEN 0 AND 3);
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_recall_range" CHECK ("recall" BETWEEN 0 AND 3);
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_application_range" CHECK ("application" BETWEEN 0 AND 3);
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_interview_range" CHECK ("interview" BETWEEN 0 AND 3);
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_duration_range" CHECK ("durationMinutes" BETWEEN 1 AND 1440);
COMMIT;
