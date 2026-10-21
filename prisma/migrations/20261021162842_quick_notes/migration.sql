-- CreateTable
CREATE TABLE "QuickNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMPTZ(3),

    CONSTRAINT "QuickNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickNote_userId_doneAt_createdAt_idx" ON "QuickNote"("userId", "doneAt", "createdAt");

-- AddForeignKey
ALTER TABLE "QuickNote" ADD CONSTRAINT "QuickNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
