-- WI-047: interview formats. Four round types of 2025–2026, a per-round AI policy and the
-- formats a company's loop uses. PostgreSQL 12+ adds several enum values in one transaction.
-- CreateEnum
CREATE TYPE "AiPolicy" AS ENUM ('UNKNOWN', 'ALLOWED', 'NOT_ALLOWED');

-- AlterEnum
ALTER TYPE "InterviewType" ADD VALUE 'AI_ASSISTED';
ALTER TYPE "InterviewType" ADD VALUE 'CODE_REVIEW';
ALTER TYPE "InterviewType" ADD VALUE 'DEBUGGING';
ALTER TYPE "InterviewType" ADD VALUE 'PRACTICAL';

-- AlterTable
ALTER TABLE "InterviewRound" ADD COLUMN     "aiPolicy" "AiPolicy" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "formats" "InterviewType"[] DEFAULT ARRAY[]::"InterviewType"[];

