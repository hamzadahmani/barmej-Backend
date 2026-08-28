CREATE TABLE "audit_logs" (
  "id_audit_log" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" INTEGER,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id_audit_log")
);

CREATE INDEX "audit_logs_place_id_created_at_idx" ON "audit_logs"("place_id", "created_at");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;
