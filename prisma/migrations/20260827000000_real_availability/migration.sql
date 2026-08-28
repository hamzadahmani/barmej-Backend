CREATE TABLE "place_opening_hours" (
  "id" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "weekday" INTEGER NOT NULL,
  "open_time" TEXT,
  "close_time" TEXT,
  "is_closed" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "place_opening_hours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "place_closures" (
  "id" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "reason" TEXT,
  CONSTRAINT "place_closures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "place_slot_overrides" (
  "id" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "time" TEXT NOT NULL,
  "capacity" INTEGER,
  "is_closed" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "place_slot_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "place_opening_hours_place_id_weekday_key" ON "place_opening_hours"("place_id", "weekday");
CREATE UNIQUE INDEX "place_closures_place_id_date_key" ON "place_closures"("place_id", "date");
CREATE UNIQUE INDEX "place_slot_overrides_place_id_date_time_key" ON "place_slot_overrides"("place_id", "date", "time");
CREATE INDEX "reservations_place_id_reservation_date_reservation_time_status_idx" ON "reservations"("place_id", "reservation_date", "reservation_time", "status");

ALTER TABLE "place_opening_hours" ADD CONSTRAINT "place_opening_hours_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "place_closures" ADD CONSTRAINT "place_closures_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "place_slot_overrides" ADD CONSTRAINT "place_slot_overrides_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "place_opening_hours" ("place_id", "weekday", "open_time", "close_time", "is_closed")
SELECT p."id_place", d.weekday,
       split_part(replace(COALESCE(p.schedule, '10:00 - 18:00'), ' ', ''), '-', 1),
       split_part(replace(COALESCE(p.schedule, '10:00 - 18:00'), ' ', ''), '-', 2),
       CASE WHEN (p.category_id = 1 AND d.weekday = 1) OR (p.category_id = 3 AND d.weekday = 2) THEN true ELSE false END
FROM "places" p CROSS JOIN generate_series(0, 6) AS d(weekday);
