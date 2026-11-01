-- AlterTable
ALTER TABLE "StudyNudgeSetting" ADD COLUMN     "learnTimes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "learnedAt" TIMESTAMPTZ(3),
ADD COLUMN     "learnedNote" TEXT,
ADD COLUMN     "pausedByFeedback" TEXT[] DEFAULT ARRAY[]::TEXT[];

