-- CreateTable
CREATE TABLE "PremiumRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "processedAt" TIMESTAMP(3),
  "processedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PremiumRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PremiumRequest_userId_createdAt_idx" ON "PremiumRequest"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PremiumRequest" ADD CONSTRAINT "PremiumRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
