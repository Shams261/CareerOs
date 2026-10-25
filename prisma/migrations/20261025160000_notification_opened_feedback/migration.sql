-- R3 (Version 2 plan): when a notification was opened, and the owner's "Useful?" answer.
-- CreateEnum
CREATE TYPE "NotificationFeedback" AS ENUM ('HELPFUL', 'NOT_TODAY', 'TOO_MANY');

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "feedback" "NotificationFeedback",
ADD COLUMN     "openedAt" TIMESTAMPTZ(3);
