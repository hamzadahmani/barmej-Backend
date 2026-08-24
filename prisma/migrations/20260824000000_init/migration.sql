CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "users" (
  "id_user" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "password_hash" TEXT,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL DEFAULT '',
  "mobile" TEXT,
  "gender" TEXT,
  "photo" TEXT,
  "birth_date" DATE,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "external_id" TEXT UNIQUE,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "device_token" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "categories" (
  "id_category" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "image" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "places" (
  "id_place" SERIAL PRIMARY KEY,
  "category_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "subtitle" TEXT,
  "image" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "phone" TEXT,
  "address" TEXT,
  "email" TEXT,
  "description" TEXT,
  "outfit" TEXT,
  "music_style" TEXT,
  "happy_hour" TEXT,
  "schedule" TEXT,
  "favorable_day" TEXT,
  "favorable_hour" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "places_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id_category") ON DELETE RESTRICT
);

CREATE TABLE "favorites" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE,
  CONSTRAINT "favorites_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE,
  CONSTRAINT "favorites_user_id_place_id_key" UNIQUE ("user_id", "place_id")
);

CREATE TABLE "reservations" (
  "id_reservation" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "reservation_date" DATE NOT NULL,
  "reservation_time" TEXT NOT NULL,
  "number_of_persons" INTEGER NOT NULL CHECK ("number_of_persons" > 0),
  "message" TEXT,
  "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE,
  CONSTRAINT "reservations_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE RESTRICT
);

CREATE TABLE "reports" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE,
  CONSTRAINT "reports_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE
);

CREATE TABLE "notifications" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE
);

CREATE INDEX "places_category_id_idx" ON "places"("category_id");
CREATE INDEX "reservations_user_id_idx" ON "reservations"("user_id");
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");
