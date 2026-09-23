-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('NOT_STARTED', 'LEARNING', 'NEEDS_REVISION', 'INTERVIEW_READY', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('RED', 'YELLOW', 'GREEN');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('SAVED', 'APPLIED', 'RECRUITER_SCREEN', 'ASSESSMENT', 'TECHNICAL', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'FINAL', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PROBLEM', 'ARTICLE', 'VIDEO', 'DOCUMENTATION', 'COURSE', 'JOB', 'REPOSITORY', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DAILY_PROGRESS', 'MISSED_CHECK_IN', 'UPCOMING_BLOCK', 'OVERDUE_TASK', 'JOB_FOLLOW_UP', 'INTERVIEW', 'DSA_REVISION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "targetDate" DATE,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeBlock" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "goalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "plannedStart" TIMESTAMPTZ(3) NOT NULL,
    "plannedEnd" TIMESTAMPTZ(3) NOT NULL,
    "status" "BlockStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "completedAt" TIMESTAMPTZ(3),
    "externalCalendarEventId" TEXT,
    "externalCalendarId" TEXT,
    "calendarSyncedAt" TIMESTAMPTZ(3),
    "routineKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActualSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "goalId" TEXT,
    "category" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActualSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsaTopic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "LearningStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DsaTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsaProblem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "problemUrl" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "topicId" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL DEFAULT 'RED',
    "notes" TEXT,
    "lastAttemptedAt" TIMESTAMPTZ(3),
    "nextRevisionAt" TIMESTAMPTZ(3),
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DsaProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningTopic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "LearningStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "goalId" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LearningTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "jobUrl" TEXT,
    "location" TEXT,
    "source" TEXT,
    "appliedAt" TIMESTAMPTZ(3),
    "stage" "JobStage" NOT NULL DEFAULT 'SAVED',
    "recruiterName" TEXT,
    "recruiterContact" TEXT,
    "notes" TEXT,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMPTZ(3),
    "interviewAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "problemId" TEXT,
    "learningTopicId" TEXT,
    "goalId" TEXT,
    "jobApplicationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "rating" INTEGER,
    "notes" TEXT,
    "blocker" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "goalId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoutineBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "offsetMinutes" INTEGER NOT NULL DEFAULT 15,
    "preferredTime" TEXT NOT NULL DEFAULT '21:30',
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "dedupeKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_userId_date_key" ON "DailyPlan"("userId", "date");

-- CreateIndex
CREATE INDEX "TimeBlock_category_plannedStart_idx" ON "TimeBlock"("category", "plannedStart");

-- CreateIndex
CREATE UNIQUE INDEX "TimeBlock_dailyPlanId_routineKey_key" ON "TimeBlock"("dailyPlanId", "routineKey");

-- CreateIndex
CREATE INDEX "ActualSession_userId_startedAt_idx" ON "ActualSession"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DsaTopic_name_key" ON "DsaTopic"("name");

-- CreateIndex
CREATE INDEX "DsaProblem_userId_nextRevisionAt_idx" ON "DsaProblem"("userId", "nextRevisionAt");

-- CreateIndex
CREATE INDEX "LearningTopic_userId_status_idx" ON "LearningTopic"("userId", "status");

-- CreateIndex
CREATE INDEX "JobApplication_userId_nextActionAt_idx" ON "JobApplication"("userId", "nextActionAt");

-- CreateIndex
CREATE INDEX "Resource_userId_idx" ON "Resource"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCheckIn_dailyPlanId_key" ON "DailyCheckIn"("dailyPlanId");

-- CreateIndex
CREATE INDEX "RoutineBlock_userId_weekday_enabled_idx" ON "RoutineBlock"("userId", "weekday", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_key" ON "NotificationPreference"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_readAt_scheduledFor_idx" ON "NotificationLog"("userId", "readAt", "scheduledFor");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualSession" ADD CONSTRAINT "ActualSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualSession" ADD CONSTRAINT "ActualSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TimeBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualSession" ADD CONSTRAINT "ActualSession_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsaProblem" ADD CONSTRAINT "DsaProblem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsaProblem" ADD CONSTRAINT "DsaProblem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "DsaTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningTopic" ADD CONSTRAINT "LearningTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningTopic" ADD CONSTRAINT "LearningTopic_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningTopic" ADD CONSTRAINT "LearningTopic_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LearningTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "DsaProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_learningTopicId_fkey" FOREIGN KEY ("learningTopicId") REFERENCES "LearningTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "DailyCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "DailyCheckIn_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "RoutineBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "RoutineBlock_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Domain invariants not expressible in the Prisma schema.
ALTER TABLE "TimeBlock" ADD CONSTRAINT "time_block_order" CHECK ("plannedEnd" > "plannedStart");
ALTER TABLE "TimeBlock" ADD CONSTRAINT "completion_consistency" CHECK ((status = 'COMPLETED') = ("completedAt" IS NOT NULL));
ALTER TABLE "ActualSession" ADD CONSTRAINT "session_order" CHECK ("endedAt" IS NULL OR "endedAt" > "startedAt");
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "rating_range" CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
ALTER TABLE "DsaProblem" ADD CONSTRAINT "attempts_nonnegative" CHECK ("attemptsCount" >= 0);
ALTER TABLE "DsaProblem" ADD CONSTRAINT "problem_url_http" CHECK ("problemUrl" ~* '^https?://[^[:space:]]+$');
ALTER TABLE "JobApplication" ADD CONSTRAINT "job_url_http" CHECK ("jobUrl" IS NULL OR "jobUrl" ~* '^https?://[^[:space:]]+$');
ALTER TABLE "Resource" ADD CONSTRAINT "resource_url_http" CHECK (url ~* '^https?://[^[:space:]]+$');
ALTER TABLE "Resource" ADD CONSTRAINT "resource_one_parent" CHECK (num_nonnulls("problemId", "learningTopicId", "goalId", "jobApplicationId") <= 1);
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "weekday_range" CHECK (weekday BETWEEN 0 AND 6);
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "routine_local_times" CHECK ("startLocal" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endLocal" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "notification_offset" CHECK ("offsetMinutes" BETWEEN 0 AND 10080);
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "notification_local_time" CHECK ("preferredTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
