-- WI-006 Google Calendar sync. Additive only: existing TimeBlocks start NOT_SYNCED; no events are created
-- until the owner connects Google, and no credentials are seeded.
BEGIN;
-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'REAUTH_REQUIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCED', 'ERROR', 'CONFLICT', 'DETACHED');

-- CreateEnum
CREATE TYPE "CalendarConflictStatus" AS ENUM ('OPEN', 'RESOLVED_LOCAL', 'RESOLVED_REMOTE');

-- AlterTable
ALTER TABLE "TimeBlock" ADD COLUMN     "calendarEtag" TEXT,
ADD COLUMN     "calendarRetryAt" TIMESTAMPTZ(3),
ADD COLUMN     "calendarSyncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "calendarSyncError" TEXT,
ADD COLUMN     "calendarSyncStatus" "CalendarSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
ADD COLUMN     "calendarSyncedHash" TEXT,
ADD COLUMN     "interviewRoundId" TEXT;

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "accountEmail" TEXT,
    "encryptedRefreshToken" TEXT,
    "scope" TEXT,
    "calendarId" TEXT,
    "calendarName" TEXT,
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "excludedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncToken" TEXT,
    "syncLeaseUntil" TIMESTAMPTZ(3),
    "lastSyncAttemptAt" TIMESTAMPTZ(3),
    "lastSuccessfulSyncAt" TIMESTAMPTZ(3),
    "lastFullSyncAt" TIMESTAMPTZ(3),
    "lastIncrementalSyncAt" TIMESTAMPTZ(3),
    "lastSyncError" TEXT,
    "lastSyncSummary" JSONB,
    "connectedAt" TIMESTAMPTZ(3),
    "disconnectedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarWatchChannel" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "resourceId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiration" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CalendarWatchChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncConflict" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timeBlockId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "localSnapshot" JSONB NOT NULL,
    "remoteSnapshot" JSONB NOT NULL,
    "status" "CalendarConflictStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMPTZ(3) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CalendarSyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_userId_key" ON "CalendarConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarWatchChannel_channelId_key" ON "CalendarWatchChannel"("channelId");

-- CreateIndex
CREATE INDEX "CalendarWatchChannel_connectionId_stoppedAt_idx" ON "CalendarWatchChannel"("connectionId", "stoppedAt");

-- CreateIndex
CREATE INDEX "CalendarSyncConflict_userId_status_idx" ON "CalendarSyncConflict"("userId", "status");

-- CreateIndex
CREATE INDEX "CalendarSyncConflict_timeBlockId_status_idx" ON "CalendarSyncConflict"("timeBlockId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TimeBlock_interviewRoundId_key" ON "TimeBlock"("interviewRoundId");

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_interviewRoundId_fkey" FOREIGN KEY ("interviewRoundId") REFERENCES "InterviewRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarWatchChannel" ADD CONSTRAINT "CalendarWatchChannel_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncConflict" ADD CONSTRAINT "CalendarSyncConflict_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncConflict" ADD CONSTRAINT "CalendarSyncConflict_timeBlockId_fkey" FOREIGN KEY ("timeBlockId") REFERENCES "TimeBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_calendar_attempts_check" CHECK ("calendarSyncAttempts" >= 0);
COMMIT;
