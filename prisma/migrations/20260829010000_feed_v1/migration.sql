CREATE TYPE "FeedEventType" AS ENUM ('FEED_IMPRESSION','VIDEO_START','VIDEO_25_PERCENT','VIDEO_50_PERCENT','VIDEO_75_PERCENT','VIDEO_COMPLETE','VIDEO_SKIP','VIDEO_REPLAY','PLACE_OPEN','FAVORITE_ADD','SHARE','RESERVATION_START','RESERVATION_CREATED','NOT_INTERESTED','REPORT');

CREATE TABLE "feed_events" (
  "id" BIGSERIAL PRIMARY KEY,
  "event_id" UUID NOT NULL UNIQUE,
  "user_id" INTEGER,
  "session_id" VARCHAR(80) NOT NULL,
  "video_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "type" "FeedEventType" NOT NULL,
  "watch_ms" INTEGER,
  "position_ms" INTEGER,
  "metadata" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feed_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE SET NULL,
  CONSTRAINT "feed_events_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "place_media"("id_media") ON DELETE CASCADE,
  CONSTRAINT "feed_events_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE
);

CREATE TABLE "user_video_states" (
  "user_id" INTEGER NOT NULL,
  "video_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total_watch_ms" INTEGER NOT NULL DEFAULT 0,
  "completed_count" INTEGER NOT NULL DEFAULT 0,
  "liked" BOOLEAN NOT NULL DEFAULT false,
  "saved" BOOLEAN NOT NULL DEFAULT false,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "user_video_states_pkey" PRIMARY KEY ("user_id", "video_id"),
  CONSTRAINT "user_video_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE,
  CONSTRAINT "user_video_states_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "place_media"("id_media") ON DELETE CASCADE,
  CONSTRAINT "user_video_states_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE
);

CREATE INDEX "feed_events_user_id_occurred_at_idx" ON "feed_events"("user_id", "occurred_at");
CREATE INDEX "feed_events_video_id_type_occurred_at_idx" ON "feed_events"("video_id", "type", "occurred_at");
CREATE INDEX "feed_events_place_id_occurred_at_idx" ON "feed_events"("place_id", "occurred_at");
CREATE INDEX "user_video_states_user_id_last_seen_at_idx" ON "user_video_states"("user_id", "last_seen_at");
CREATE INDEX "user_video_states_place_id_idx" ON "user_video_states"("place_id");
