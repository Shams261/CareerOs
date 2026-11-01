-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'AGENT_LINE';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STUDY_MIDDAY';

-- AlterTable
ALTER TABLE "StudyNudgeSetting" ADD COLUMN     "middayEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "middayPausedUntil" DATE,
ADD COLUMN     "middayTime" TEXT NOT NULL DEFAULT '13:00',
ADD COLUMN     "rumiLines" BOOLEAN NOT NULL DEFAULT false;

