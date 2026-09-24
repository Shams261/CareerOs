BEGIN;
-- Preserve existing topic status vocabulary and all legacy summary evidence.
ALTER TYPE "LearningStatus" ADD VALUE 'PAUSED';
CREATE TYPE "Independence" AS ENUM ('YES', 'PARTIAL', 'NO');
ALTER TABLE "User" ADD COLUMN "currentDsaTopicId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_currentDsaTopicId_fkey" FOREIGN KEY ("currentDsaTopicId") REFERENCES "DsaTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DsaProblem" ADD COLUMN "revisionStage" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "revisionManual" BOOLEAN NOT NULL DEFAULT false;
-- Interpret legacy instants in the owning user's zone before changing column type.
ALTER TABLE "DsaProblem" ADD COLUMN "revisionDate" DATE;
UPDATE "DsaProblem" p SET "revisionDate" = (p."nextRevisionAt" AT TIME ZONE u.timezone)::date FROM "User" u WHERE u.id=p."userId";
ALTER TABLE "DsaProblem" DROP COLUMN "nextRevisionAt";
ALTER TABLE "DsaProblem" RENAME COLUMN "revisionDate" TO "nextRevisionAt";
CREATE INDEX "DsaProblem_userId_nextRevisionAt_idx" ON "DsaProblem"("userId", "nextRevisionAt");
ALTER TABLE "DsaProblem" ADD CONSTRAINT "DsaProblem_revisionStage_check" CHECK ("revisionStage" BETWEEN 0 AND 3);
CREATE TABLE "DsaAttempt" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "problemId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL, "attemptedAt" TIMESTAMPTZ(3) NOT NULL,
 "confidenceBefore" "Confidence", "confidenceAfter" "Confidence" NOT NULL,
 "solvedIndependently" "Independence" NOT NULL, "durationMinutes" INTEGER,
 "notes" TEXT, "mistake" TEXT, "actualSessionId" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DsaAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DsaAttempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "DsaProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DsaAttempt_actualSessionId_fkey" FOREIGN KEY ("actualSessionId") REFERENCES "ActualSession"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "DsaAttempt_duration_check" CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 1440),
 CONSTRAINT "DsaAttempt_confidence_check" CHECK (("solvedIndependently"='YES' AND "confidenceAfter" IN ('YELLOW','GREEN')) OR ("solvedIndependently" IN ('NO','PARTIAL') AND "confidenceAfter" IN ('RED','YELLOW')))
);
CREATE UNIQUE INDEX "DsaAttempt_userId_requestId_key" ON "DsaAttempt"("userId", "requestId");
CREATE INDEX "DsaAttempt_userId_attemptedAt_idx" ON "DsaAttempt"("userId", "attemptedAt");
CREATE INDEX "DsaAttempt_problemId_attemptedAt_idx" ON "DsaAttempt"("problemId", "attemptedAt");

COMMIT;
