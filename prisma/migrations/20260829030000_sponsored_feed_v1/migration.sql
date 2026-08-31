CREATE TABLE "sponsored_campaigns" (
  "id" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "video_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "daily_budget_cents" INTEGER NOT NULL,
  "total_budget_cents" INTEGER NOT NULL,
  "bid_cpm_cents" INTEGER NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "radius_km" DOUBLE PRECISION,
  "max_impressions_per_user_day" INTEGER NOT NULL DEFAULT 2,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sponsored_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sponsored_impressions" (
  "id" BIGSERIAL NOT NULL,
  "campaign_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "session_id" VARCHAR(80) NOT NULL,
  "video_id" INTEGER NOT NULL,
  "clicked" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sponsored_impressions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sponsored_campaigns_active_starts_at_ends_at_idx" ON "sponsored_campaigns"("active", "starts_at", "ends_at");
CREATE INDEX "sponsored_campaigns_place_id_idx" ON "sponsored_campaigns"("place_id");
CREATE UNIQUE INDEX "sponsored_impressions_campaign_id_user_id_session_id_key" ON "sponsored_impressions"("campaign_id", "user_id", "session_id");
CREATE INDEX "sponsored_impressions_campaign_id_created_at_idx" ON "sponsored_impressions"("campaign_id", "created_at");
CREATE INDEX "sponsored_impressions_user_id_created_at_idx" ON "sponsored_impressions"("user_id", "created_at");

ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "place_media"("id_media") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsored_impressions" ADD CONSTRAINT "sponsored_impressions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "sponsored_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
