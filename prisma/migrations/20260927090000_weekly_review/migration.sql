-- WI-007 weekly review loop. Additive: written reviews and priorities only; weekly metrics are
-- derived from source tables at read time. No existing data changes.
BEGIN;
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY_REVIEW';

-- CreateTable
CREATE TABLE "WeeklyReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "biggestWin" TEXT,
    "biggestBlocker" TEXT,
    "lessons" TEXT,
    "nextWeekChange" TEXT,
    "carryForward" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPriority" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "goalId" TEXT,
    "target" INTEGER,
    "targetUnit" TEXT,
    "ordering" INTEGER NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WeeklyPriority_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReview_userId_weekStart_key" ON "WeeklyReview"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklyPriority_reviewId_ordering_idx" ON "WeeklyPriority"("reviewId", "ordering");

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPriority" ADD CONSTRAINT "WeeklyPriority_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPriority" ADD CONSTRAINT "WeeklyPriority_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "WeeklyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPriority" ADD CONSTRAINT "WeeklyPriority_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_week_starts_monday" CHECK (EXTRACT(ISODOW FROM "weekStart") = 1);
ALTER TABLE "WeeklyPriority" ADD CONSTRAINT "WeeklyPriority_target_positive" CHECK ("target" IS NULL OR "target" > 0);
ALTER TABLE "WeeklyPriority" ADD CONSTRAINT "WeeklyPriority_ordering_nonnegative" CHECK ("ordering" >= 0);
COMMIT;
