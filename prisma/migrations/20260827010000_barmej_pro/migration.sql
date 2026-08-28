ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ESTABLISHMENT';
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'PROPOSED';

ALTER TABLE "reservations"
  ADD COLUMN "proposed_date" DATE,
  ADD COLUMN "proposed_time" TEXT,
  ADD COLUMN "proposal_message" TEXT;

CREATE TABLE "place_managers" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "place_managers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "place_managers_user_id_place_id_key" ON "place_managers"("user_id", "place_id");
CREATE INDEX "place_managers_place_id_idx" ON "place_managers"("place_id");
ALTER TABLE "place_managers" ADD CONSTRAINT "place_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "place_managers" ADD CONSTRAINT "place_managers_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
