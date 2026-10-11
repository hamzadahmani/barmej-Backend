-- Vues des fiches établissement (statistiques Barmej Pro et backoffice).
CREATE TABLE "place_views" (
  "id" BIGSERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "user_id" INTEGER,
  "source" VARCHAR(30) NOT NULL DEFAULT 'app',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "place_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "place_views_place_id_created_at_idx" ON "place_views"("place_id", "created_at");
CREATE INDEX "place_views_created_at_idx" ON "place_views"("created_at");
CREATE INDEX "place_views_user_id_place_id_created_at_idx" ON "place_views"("user_id", "place_id", "created_at");
ALTER TABLE "place_views" ADD CONSTRAINT "place_views_place_id_fkey"
FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "place_views" ADD CONSTRAINT "place_views_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;
