CREATE TYPE "VenueEnvironment" AS ENUM ('INDOOR', 'OUTDOOR', 'COVERED_OUTDOOR', 'MIXED');
CREATE TYPE "BarmejliPlanStatus" AS ENUM ('DRAFT', 'SAVED', 'ARCHIVED');

ALTER TABLE "places"
  ADD COLUMN "suitability_moods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "group_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "environment" "VenueEnvironment" NOT NULL DEFAULT 'INDOOR',
  ADD COLUMN "weather_sensitive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "default_duration_min" INTEGER NOT NULL DEFAULT 60;

CREATE TABLE "experiences" (
  "id_experience" SERIAL PRIMARY KEY,
  "place_id" INTEGER NOT NULL REFERENCES "places"("id_place") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "price" INTEGER NOT NULL DEFAULT 0,
  "duration_min" INTEGER NOT NULL DEFAULT 60,
  "suitability_moods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "group_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "environment" "VenueEnvironment" NOT NULL DEFAULT 'INDOOR',
  "weather_sensitive" BOOLEAN NOT NULL DEFAULT false,
  "min_temperature_c" DOUBLE PRECISION,
  "max_temperature_c" DOUBLE PRECISION,
  "max_wind_kph" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "barmejli_plans" (
  "id_plan" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id_user") ON DELETE CASCADE,
  "status" "BarmejliPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "original_prompt" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "budget" INTEGER NOT NULL,
  "mood" TEXT NOT NULL,
  "group_type" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "weather_snapshot" JSONB NOT NULL,
  "weather_checked_at" TIMESTAMP(3) NOT NULL,
  "total_cost" INTEGER NOT NULL,
  "total_duration_min" INTEGER NOT NULL,
  "total_distance_km" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "barmejli_steps" (
  "id_step" SERIAL PRIMARY KEY,
  "plan_id" INTEGER NOT NULL REFERENCES "barmejli_plans"("id_plan") ON DELETE CASCADE,
  "place_id" INTEGER NOT NULL REFERENCES "places"("id_place") ON DELETE RESTRICT,
  "experience_id" INTEGER REFERENCES "experiences"("id_experience") ON DELETE SET NULL,
  "position" INTEGER NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "estimated_cost" INTEGER NOT NULL,
  "travel_minutes" INTEGER NOT NULL DEFAULT 0,
  "travel_distance_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "travel_mode" TEXT NOT NULL DEFAULT 'walk',
  "weather_fallback" BOOLEAN NOT NULL DEFAULT false,
  "place_name_snapshot" TEXT NOT NULL,
  "title_snapshot" TEXT NOT NULL
);

CREATE INDEX "experiences_place_id_active_idx" ON "experiences"("place_id", "active");
CREATE INDEX "experiences_category_active_idx" ON "experiences"("category", "active");
CREATE INDEX "barmejli_plans_user_id_status_scheduled_at_idx" ON "barmejli_plans"("user_id", "status", "scheduled_at");
CREATE UNIQUE INDEX "barmejli_steps_plan_id_position_key" ON "barmejli_steps"("plan_id", "position");
CREATE INDEX "barmejli_steps_place_id_idx" ON "barmejli_steps"("place_id");

-- Uses the PostGIS geography maintained by the feed when that optional column
-- is actually present. Some existing installations recorded the PostGIS
-- migration while retaining latitude/longitude only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'places' AND column_name = 'location'
  ) THEN
    CREATE INDEX IF NOT EXISTS "places_location_barmejli_gist" ON "places" USING GIST ("location");
  END IF;
END $$;
