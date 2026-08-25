CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'CONFIRMED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "GroupPlanStatus" AS ENUM ('VOTING', 'FINALIZED', 'CANCELLED');

ALTER TABLE "places" ADD COLUMN "average_price" INTEGER;
ALTER TABLE "places" ADD COLUMN "capacity_per_slot" INTEGER NOT NULL DEFAULT 20;

CREATE TABLE "reviews" (
  "id" SERIAL PRIMARY KEY,
  "reservation_id" INTEGER NOT NULL UNIQUE,
  "user_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "cuisine_rating" INTEGER NOT NULL,
  "service_rating" INTEGER NOT NULL,
  "ambiance_rating" INTEGER NOT NULL,
  "price_rating" INTEGER NOT NULL,
  "comment" TEXT,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "establishment_response" TEXT,
  "responded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reviews_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id_reservation") ON DELETE CASCADE,
  CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE,
  CONSTRAINT "reviews_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE,
  CONSTRAINT "reviews_ratings_check" CHECK ("cuisine_rating" BETWEEN 1 AND 5 AND "service_rating" BETWEEN 1 AND 5 AND "ambiance_rating" BETWEEN 1 AND 5 AND "price_rating" BETWEEN 1 AND 5)
);
CREATE INDEX "reviews_place_id_created_at_idx" ON "reviews"("place_id", "created_at");

CREATE TABLE "waitlist_entries" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "reservation_date" DATE NOT NULL,
  "reservation_time" TEXT NOT NULL,
  "number_of_persons" INTEGER NOT NULL,
  "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
  "offer_expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE,
  CONSTRAINT "waitlist_entries_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE,
  CONSTRAINT "waitlist_people_check" CHECK ("number_of_persons" BETWEEN 1 AND 20)
);
CREATE UNIQUE INDEX "waitlist_entries_user_id_place_id_reservation_date_reservation_time_key" ON "waitlist_entries"("user_id", "place_id", "reservation_date", "reservation_time");
CREATE INDEX "waitlist_entries_place_id_reservation_date_reservation_time_status_idx" ON "waitlist_entries"("place_id", "reservation_date", "reservation_time", "status");

CREATE TABLE "group_plans" (
  "id" SERIAL PRIMARY KEY,
  "organizer_id" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "invite_emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "GroupPlanStatus" NOT NULL DEFAULT 'VOTING',
  "voting_ends_at" TIMESTAMP(3),
  "selected_option_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "group_plans_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id_user") ON DELETE CASCADE
);
CREATE INDEX "group_plans_organizer_id_created_at_idx" ON "group_plans"("organizer_id", "created_at");

CREATE TABLE "group_options" (
  "id" SERIAL PRIMARY KEY,
  "plan_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "reservation_date" DATE NOT NULL,
  "reservation_time" TEXT NOT NULL,
  CONSTRAINT "group_options_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "group_plans"("id") ON DELETE CASCADE,
  CONSTRAINT "group_options_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "group_options_plan_id_place_id_reservation_date_reservation_time_key" ON "group_options"("plan_id", "place_id", "reservation_date", "reservation_time");

CREATE TABLE "group_votes" (
  "id" SERIAL PRIMARY KEY,
  "option_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "group_options"("id") ON DELETE CASCADE,
  CONSTRAINT "group_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "group_votes_option_id_user_id_key" ON "group_votes"("option_id", "user_id");
