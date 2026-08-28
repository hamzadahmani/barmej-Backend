CREATE TABLE "place_categories" (
  "place_id" INTEGER NOT NULL,
  "category_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "place_categories_pkey" PRIMARY KEY ("place_id", "category_id")
);

CREATE INDEX "place_categories_category_id_idx" ON "place_categories"("category_id");

ALTER TABLE "place_categories"
  ADD CONSTRAINT "place_categories_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "place_categories"
  ADD CONSTRAINT "place_categories_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id_category") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "place_categories" ("place_id", "category_id")
SELECT "id_place", "category_id" FROM "places"
ON CONFLICT DO NOTHING;
