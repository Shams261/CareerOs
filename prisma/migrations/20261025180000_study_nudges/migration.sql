-- WI-028 Study Nudges: settings (off by default), rest days, a presence stamp, in-app-only reminders.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'STUDY_MORNING';
ALTER TYPE "NotificationType" ADD VALUE 'STUDY_EVENING';

-- AlterTable
ALTER TABLE "DailyPlan" ADD COLUMN     "restAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "inAppOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "StudyNudgeSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "morningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "morningTime" TEXT NOT NULL DEFAULT '08:00',
    "eveningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "eveningTime" TEXT NOT NULL DEFAULT '19:30',
    "days" INTEGER NOT NULL DEFAULT 31,
    "onlyStudyDays" BOOLEAN NOT NULL DEFAULT true,
    "quietStart" TEXT NOT NULL DEFAULT '22:00',
    "quietEnd" TEXT NOT NULL DEFAULT '07:30',
    "pausedUntil" DATE,
    "studyCategories" TEXT[] DEFAULT ARRAY['DSA', 'Technical']::TEXT[],
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudyNudgeSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyNudgeSetting_userId_key" ON "StudyNudgeSetting"("userId");

-- AddForeignKey
ALTER TABLE "StudyNudgeSetting" ADD CONSTRAINT "StudyNudgeSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Times are local "HH:MM"; days are a non-empty set of weekday bits.
ALTER TABLE "StudyNudgeSetting" ADD CONSTRAINT "StudyNudgeSetting_times_check" CHECK (
  "morningTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "eveningTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "quietStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "quietEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);
ALTER TABLE "StudyNudgeSetting" ADD CONSTRAINT "StudyNudgeSetting_days_check" CHECK ("days" BETWEEN 1 AND 127);
