-- AlterTable
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill existing rows with deterministic unique username.
UPDATE "User"
SET "username" = CONCAT(
  regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '_', 'g'),
  '_',
  substring("id" FROM 1 FOR 6)
)
WHERE "username" IS NULL;

-- Enforce not-null and uniqueness.
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
