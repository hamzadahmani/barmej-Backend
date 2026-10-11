-- Gestion des abonnements : prix des formules et périodes d'abonnement datées.
CREATE TABLE "subscription_plan_prices" (
  "plan" "SubscriptionPlan" NOT NULL,
  "monthly_price" INTEGER NOT NULL,
  "yearly_price" INTEGER,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_plan_prices_pkey" PRIMARY KEY ("plan")
);
INSERT INTO "subscription_plan_prices" ("plan", "monthly_price") VALUES ('DISCOVERY', 0) ON CONFLICT DO NOTHING;

CREATE TABLE "subscription_periods" (
  "id" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "plan" "SubscriptionPlan" NOT NULL,
  "starts_at" DATE NOT NULL,
  "ends_at" DATE NOT NULL,
  "amount" INTEGER NOT NULL,
  "note" TEXT,
  "created_by_id" INTEGER,
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_periods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subscription_periods_place_id_starts_at_ends_at_idx" ON "subscription_periods"("place_id", "starts_at", "ends_at");
CREATE INDEX "subscription_periods_starts_at_idx" ON "subscription_periods"("starts_at");
CREATE INDEX "subscription_periods_ends_at_idx" ON "subscription_periods"("ends_at");
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_place_id_fkey"
FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
