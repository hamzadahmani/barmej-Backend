ALTER TABLE "barmejli_steps" ADD COLUMN "menu_selection" JSONB;

CREATE TABLE "place_menus" (
  "id" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "public_id" TEXT NOT NULL,
  "image_url" TEXT NOT NULL,
  "draft_items" JSONB NOT NULL DEFAULT '[]',
  "items" JSONB NOT NULL DEFAULT '[]',
  "ocr_text" TEXT,
  "validated_at" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "place_menus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "place_menus_public_id_key" ON "place_menus"("public_id");
CREATE INDEX "place_menus_place_id_active_validated_at_idx" ON "place_menus"("place_id", "active", "validated_at");
ALTER TABLE "place_menus" ADD CONSTRAINT "place_menus_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
