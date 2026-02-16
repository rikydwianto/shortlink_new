/*
  Warnings:

  - Made the column `title` on table `Link` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Link" ADD COLUMN     "allowedCountries" TEXT[],
ADD COLUMN     "allowedDevices" TEXT[],
ADD COLUMN     "description" TEXT,
ADD COLUMN     "enableTracking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lastClickedAt" TIMESTAMP(3),
ADD COLUMN     "maxClicks" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "qrCodePath" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "trackingPixelId" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ALTER COLUMN "title" SET NOT NULL;
