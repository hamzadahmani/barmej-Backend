CREATE TYPE "MediaModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "place_media" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "place_media" ADD COLUMN "moderation_status" "MediaModerationStatus" NOT NULL DEFAULT 'APPROVED';
CREATE INDEX "place_media_type_active_moderation_status_idx" ON "place_media"("type", "active", "moderation_status");
