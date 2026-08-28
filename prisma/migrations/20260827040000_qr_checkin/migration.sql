ALTER TABLE "reservations"
ADD COLUMN "checked_in_at" TIMESTAMP(3),
ADD COLUMN "completed_at" TIMESTAMP(3),
ADD COLUMN "no_show_marked_at" TIMESTAMP(3);
