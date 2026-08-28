ALTER TABLE "notifications"
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "reference_key" TEXT;

CREATE UNIQUE INDEX "notifications_user_id_type_reference_key_key"
ON "notifications"("user_id", "type", "reference_key");
