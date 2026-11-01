-- CreateEnum
CREATE TYPE "AgentMemoryKind" AS ENUM ('GOAL', 'HABIT', 'PREFERENCE', 'SITUATION');

-- CreateEnum
CREATE TYPE "AgentMemorySource" AS ENUM ('OWNER', 'RUMI');

-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'AGENT_MEMORY';

-- AlterTable
ALTER TABLE "AgentMemory" ADD COLUMN     "expiresAt" DATE,
ADD COLUMN     "kind" "AgentMemoryKind" NOT NULL DEFAULT 'PREFERENCE',
ADD COLUMN     "lastUsedAt" TIMESTAMPTZ(3),
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "source" "AgentMemorySource" NOT NULL DEFAULT 'OWNER';

-- AlterTable
ALTER TABLE "AiSetting" ADD COLUMN     "rumiStyle" TEXT NOT NULL DEFAULT 'firm';

-- CreateTable
CREATE TABLE "AgentSetting" (
    "userId" TEXT NOT NULL,
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lineLanguage" TEXT NOT NULL DEFAULT 'en',
    "voiceConsentAt" TIMESTAMPTZ(3),
    "voiceLang" TEXT NOT NULL DEFAULT 'en-IN',
    "speakReplies" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgentSetting_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AgentMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSetting" ADD CONSTRAINT "AgentSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

