CREATE TABLE "place_events" (
  "id_event" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "start_date" DATE,
  "end_date" DATE,
  "start_time" TEXT,
  "end_time" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "place_events_pkey" PRIMARY KEY ("id_event")
);

CREATE INDEX "place_events_place_id_active_idx" ON "place_events"("place_id", "active");

ALTER TABLE "place_events"
  ADD CONSTRAINT "place_events_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "place_events" ("place_id", "title", "description", "active")
SELECT "id_place", 'Happy hour', "happy_hour", true
FROM "places"
WHERE "happy_hour" IS NOT NULL AND BTRIM("happy_hour") <> '';
