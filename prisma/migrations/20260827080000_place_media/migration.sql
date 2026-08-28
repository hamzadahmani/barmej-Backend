CREATE TYPE "PlaceMediaType" AS ENUM ('COVER', 'GALLERY');

CREATE TABLE "place_media" (
  "id_media" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "public_id" TEXT NOT NULL,
  "secure_url" TEXT NOT NULL,
  "type" "PlaceMediaType" NOT NULL DEFAULT 'GALLERY',
  "width" INTEGER,
  "height" INTEGER,
  "bytes" INTEGER,
  "format" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "place_media_pkey" PRIMARY KEY ("id_media")
);

CREATE UNIQUE INDEX "place_media_public_id_key" ON "place_media"("public_id");
CREATE INDEX "place_media_place_id_type_sort_order_idx" ON "place_media"("place_id", "type", "sort_order");

ALTER TABLE "place_media"
  ADD CONSTRAINT "place_media_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
