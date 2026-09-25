-- WI-008 production launch: owner sessions, Web Push subscriptions, job-run status.
-- Existing reminders predate push delivery: mark them attempted so an upgrade never pushes a
-- backlog of old notifications. No other data changes.
BEGIN;
-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "pushAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastFailureAt" TIMESTAMPTZ(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "name" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMPTZ(3),
    "lastSucceededAt" TIMESTAMPTZ(3),
    "lastFailedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "lastSummary" JSONB,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_revokedAt_idx" ON "PushSubscription"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "NotificationLog" SET "pushAttempts" = 3;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_push_attempts_check" CHECK ("pushAttempts" >= 0);
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_failures_check" CHECK ("failureCount" >= 0);
ALTER TABLE "Session" ADD CONSTRAINT "Session_expiry_check" CHECK ("expiresAt" > "createdAt");
COMMIT;
