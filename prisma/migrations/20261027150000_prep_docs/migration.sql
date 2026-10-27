-- WI-042 (ADR-024): interview prep docs Rumi writes from web research, mapped to the owner's
-- roadmap and problems, and a ledger feature for each of their searches and writing calls.
-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'PREP_RESEARCH';

-- CreateTable
CREATE TABLE "InterviewPrepDoc" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "queries" TEXT[],
    "usedJobDescription" BOOLEAN NOT NULL DEFAULT false,
    "content" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewPrepDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewPrepDoc_userId_applicationId_createdAt_idx" ON "InterviewPrepDoc"("userId", "applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "InterviewPrepDoc" ADD CONSTRAINT "InterviewPrepDoc_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrepDoc" ADD CONSTRAINT "InterviewPrepDoc_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most six searches a doc (ADR-024 allows eight).
ALTER TABLE "InterviewPrepDoc" ADD CONSTRAINT "InterviewPrepDoc_queries_count" CHECK (cardinality("queries") BETWEEN 1 AND 8);
