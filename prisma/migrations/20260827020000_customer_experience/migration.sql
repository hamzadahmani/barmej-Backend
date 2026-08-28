ALTER TABLE "users"
  ADD COLUMN "dietary_preferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "allergies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "favorite_ambiences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "preferred_budget" INTEGER;

ALTER TABLE "places"
  ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cuisine_type" TEXT,
  ADD COLUMN "ambience_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "reservations"
  ADD COLUMN "seating_preference" TEXT,
  ADD COLUMN "allergies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "occasion" TEXT,
  ADD COLUMN "cancellation_reason" TEXT;
