BEGIN;
-- CreateEnum
CREATE TYPE "WorkArrangement" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ActionOwner" AS ENUM ('ME', 'COMPANY', 'NONE');

-- CreateEnum
CREATE TYPE "JobActivityType" AS ENUM ('CREATED', 'STAGE_CHANGED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_RESCHEDULED', 'INTERVIEW_RESULT', 'FOLLOW_UP_SET', 'FOLLOW_UP_DONE', 'NOTE');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('RECRUITER', 'ASSESSMENT', 'CODING', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'HIRING_MANAGER', 'FINAL', 'OTHER');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PrepKind" AS ENUM ('PREP', 'GAP');


-- JobApplication: new optional details. Existing rows keep NONE/UNKNOWN/2 defaults; no owner or arrangement is inferred.
ALTER TABLE "JobApplication"
ADD COLUMN "workArrangement" "WorkArrangement" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "employmentType" TEXT,
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "hiringContact" TEXT,
ADD COLUMN "compensationNotes" TEXT,
ADD COLUMN "jobDescription" TEXT,
ADD COLUMN "actionOwner" "ActionOwner" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_priority_check" CHECK ("priority" BETWEEN 1 AND 3);

-- Applied and follow-up dates are owner calendar dates (ADR-003). Interpret legacy instants in the owner's zone.
ALTER TABLE "JobApplication" ADD COLUMN "appliedDate" DATE, ADD COLUMN "nextActionDate" DATE;
UPDATE "JobApplication" j SET
  "appliedDate" = (j."appliedAt" AT TIME ZONE u.timezone)::date,
  "nextActionDate" = (j."nextActionAt" AT TIME ZONE u.timezone)::date
FROM "User" u WHERE u.id = j."userId";
DROP INDEX "JobApplication_userId_nextActionAt_idx";
ALTER TABLE "JobApplication" DROP COLUMN "appliedAt", DROP COLUMN "nextActionAt";
ALTER TABLE "JobApplication" RENAME COLUMN "appliedDate" TO "appliedAt";
CREATE INDEX "JobApplication_userId_nextActionDate_idx" ON "JobApplication"("userId", "nextActionDate");

-- CreateTable
CREATE TABLE "JobActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "JobActivityType" NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "fromStage" "JobStage",
    "toStage" "JobStage",
    "interviewRoundId" TEXT,
    "previousStart" TIMESTAMPTZ(3),
    "newStart" TIMESTAMPTZ(3),
    "note" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "InterviewType" NOT NULL DEFAULT 'OTHER',
    "scheduledStart" TIMESTAMPTZ(3) NOT NULL,
    "scheduledEnd" TIMESTAMPTZ(3),
    "timezone" TEXT NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "interviewers" TEXT,
    "meetingUrl" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "topicsAsked" TEXT,
    "wentWell" TEXT,
    "toImprove" TEXT,
    "outcomeNotes" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InterviewRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewPrepItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "kind" "PrepKind" NOT NULL DEFAULT 'PREP',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMPTZ(3),
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "learningTopicId" TEXT,
    "dsaProblemId" TEXT,
    "dsaTopicId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InterviewPrepItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobActivity_applicationId_occurredAt_idx" ON "JobActivity"("applicationId", "occurredAt");

-- CreateIndex
CREATE INDEX "JobActivity_userId_occurredAt_idx" ON "JobActivity"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobActivity_userId_requestId_key" ON "JobActivity"("userId", "requestId");

-- CreateIndex
CREATE INDEX "InterviewRound_userId_scheduledStart_idx" ON "InterviewRound"("userId", "scheduledStart");

-- CreateIndex
CREATE INDEX "InterviewRound_applicationId_scheduledStart_idx" ON "InterviewRound"("applicationId", "scheduledStart");

-- CreateIndex
CREATE INDEX "InterviewPrepItem_roundId_ordering_idx" ON "InterviewPrepItem"("roundId", "ordering");

-- CreateIndex
CREATE INDEX "InterviewPrepItem_learningTopicId_idx" ON "InterviewPrepItem"("learningTopicId");

-- CreateIndex
CREATE INDEX "InterviewPrepItem_dsaProblemId_idx" ON "InterviewPrepItem"("dsaProblemId");

-- CreateIndex
CREATE INDEX "JobApplication_userId_stage_idx" ON "JobApplication"("userId", "stage");

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_interviewRoundId_fkey" FOREIGN KEY ("interviewRoundId") REFERENCES "InterviewRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewRound" ADD CONSTRAINT "InterviewRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewRound" ADD CONSTRAINT "InterviewRound_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrepItem" ADD CONSTRAINT "InterviewPrepItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrepItem" ADD CONSTRAINT "InterviewPrepItem_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrepItem" ADD CONSTRAINT "InterviewPrepItem_learningTopicId_fkey" FOREIGN KEY ("learningTopicId") REFERENCES "LearningTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrepItem" ADD CONSTRAINT "InterviewPrepItem_dsaProblemId_fkey" FOREIGN KEY ("dsaProblemId") REFERENCES "DsaProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrepItem" ADD CONSTRAINT "InterviewPrepItem_dsaTopicId_fkey" FOREIGN KEY ("dsaTopicId") REFERENCES "DsaTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A legacy single interview instant becomes one scheduled round; the owner records its real outcome.
INSERT INTO "InterviewRound" (id, "userId", "applicationId", title, type, "scheduledStart", timezone, status, "updatedAt")
SELECT 'legacy-round-' || j.id, j."userId", j.id, 'Interview (imported)', 'OTHER', j."interviewAt", u.timezone, 'SCHEDULED', CURRENT_TIMESTAMP
FROM "JobApplication" j JOIN "User" u ON u.id = j."userId" WHERE j."interviewAt" IS NOT NULL;
ALTER TABLE "JobApplication" DROP COLUMN "interviewAt";

ALTER TABLE "InterviewRound" ADD CONSTRAINT "InterviewRound_end_after_start" CHECK ("scheduledEnd" IS NULL OR "scheduledEnd" > "scheduledStart");
ALTER TABLE "InterviewPrepItem" ADD CONSTRAINT "InterviewPrepItem_single_link" CHECK (num_nonnulls("learningTopicId", "dsaProblemId", "dsaTopicId") <= 1);
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_stage_change" CHECK ("type" <> 'STAGE_CHANGED' OR ("toStage" IS NOT NULL AND "fromStage" IS DISTINCT FROM "toStage"));
COMMIT;
