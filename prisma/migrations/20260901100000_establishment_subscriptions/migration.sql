CREATE TYPE "SubscriptionPlan" AS ENUM ('DISCOVERY', 'ESSENTIAL', 'PRO', 'PREMIUM');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');

CREATE TABLE "establishment_subscriptions" (
  "id_subscription" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "plan" "SubscriptionPlan" NOT NULL DEFAULT 'DISCOVERY',
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "requested_plan" "SubscriptionPlan",
  "requested_at" TIMESTAMP(3),
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "activated_by_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "establishment_subscriptions_pkey" PRIMARY KEY ("id_subscription")
);

CREATE UNIQUE INDEX "establishment_subscriptions_place_id_key" ON "establishment_subscriptions"("place_id");
CREATE INDEX "establishment_subscriptions_plan_status_idx" ON "establishment_subscriptions"("plan", "status");
CREATE INDEX "establishment_subscriptions_requested_plan_requested_at_idx" ON "establishment_subscriptions"("requested_plan", "requested_at");
ALTER TABLE "establishment_subscriptions" ADD CONSTRAINT "establishment_subscriptions_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
