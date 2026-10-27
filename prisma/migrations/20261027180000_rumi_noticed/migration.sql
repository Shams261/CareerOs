-- WI-043: the owner's answers to "Rumi noticed" cards (acted or dismissed), which hide a card
-- for a few days and count for the plan's measure.
-- CreateTable
CREATE TABLE "NoticedAnswer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hiddenUntil" DATE NOT NULL,
    "actedAt" TIMESTAMPTZ(3),
    "dismissedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NoticedAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoticedAnswer_userId_key_key" ON "NoticedAnswer"("userId", "key");

-- AddForeignKey
ALTER TABLE "NoticedAnswer" ADD CONSTRAINT "NoticedAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The four kinds the rules make.
ALTER TABLE "NoticedAnswer" ADD CONSTRAINT "NoticedAnswer_kind_known" CHECK ("kind" IN ('interview', 'idle', 'routine', 'heavy'));
