-- Séjours en maison d'hôtes : prix par nuit, nombre de chambres et réservations à la nuit.
ALTER TABLE "places" ADD COLUMN "nightly_price" INTEGER;
ALTER TABLE "places" ADD COLUMN "room_count" INTEGER;

CREATE TABLE "stay_bookings" (
  "id_stay_booking" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "check_in" DATE NOT NULL,
  "check_out" DATE NOT NULL,
  "nights" INTEGER NOT NULL,
  "guests" INTEGER NOT NULL,
  "rooms" INTEGER NOT NULL DEFAULT 1,
  "estimate" INTEGER,
  "message" TEXT,
  "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stay_bookings_pkey" PRIMARY KEY ("id_stay_booking")
);

CREATE INDEX "stay_bookings_user_id_idx" ON "stay_bookings"("user_id");
CREATE INDEX "stay_bookings_place_id_check_in_check_out_status_idx" ON "stay_bookings"("place_id", "check_in", "check_out", "status");
ALTER TABLE "stay_bookings" ADD CONSTRAINT "stay_bookings_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stay_bookings" ADD CONSTRAINT "stay_bookings_place_id_fkey"
FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE RESTRICT ON UPDATE CASCADE;
