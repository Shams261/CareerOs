-- WI-039: a nudge when a study block's start has passed with nothing begun.
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STUDY_BLOCK';

-- AlterTable
ALTER TABLE "StudyNudgeSetting" ADD COLUMN     "blockStartEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockStartMinutes" INTEGER NOT NULL DEFAULT 15;

-- The offset stays between 5 and 60 minutes, as the Settings form allows.
ALTER TABLE "StudyNudgeSetting" ADD CONSTRAINT "StudyNudgeSetting_block_start_check" CHECK ("blockStartMinutes" BETWEEN 5 AND 60);
