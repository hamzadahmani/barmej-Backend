CREATE TYPE "LoyaltyRedemptionStatus" AS ENUM ('PENDING', 'REDEEMED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "loyalty_rewards" (
  "id_loyalty_reward" SERIAL NOT NULL,
  "program_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "points_cost" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "stock" INTEGER,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id_loyalty_reward")
);

CREATE TABLE "loyalty_redemptions" (
  "id_loyalty_redemption" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "place_id" INTEGER NOT NULL,
  "reward_id" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "status" "LoyaltyRedemptionStatus" NOT NULL DEFAULT 'PENDING',
  "points_cost" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "redeemed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loyalty_redemptions_pkey" PRIMARY KEY ("id_loyalty_redemption")
);

CREATE UNIQUE INDEX "loyalty_redemptions_token_key" ON "loyalty_redemptions"("token");
CREATE INDEX "loyalty_rewards_place_id_active_points_cost_idx" ON "loyalty_rewards"("place_id", "active", "points_cost");
CREATE INDEX "loyalty_redemptions_user_id_status_expires_at_idx" ON "loyalty_redemptions"("user_id", "status", "expires_at");
CREATE INDEX "loyalty_redemptions_place_id_status_idx" ON "loyalty_redemptions"("place_id", "status");

ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "loyalty_programs"("id_loyalty_program") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "loyalty_rewards"("id_loyalty_reward") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "loyalty_rewards" ("program_id", "place_id", "name", "points_cost", "updated_at")
SELECT "id_loyalty_program", "place_id", "reward_name", "reward_cost", CURRENT_TIMESTAMP
FROM "loyalty_programs";
