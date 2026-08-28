CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'ADJUST');

CREATE TABLE "loyalty_programs" ("id_loyalty_program" SERIAL NOT NULL, "place_id" INTEGER NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "points_per_visit" INTEGER NOT NULL DEFAULT 10, "reward_name" TEXT NOT NULL DEFAULT 'Une récompense offerte', "reward_cost" INTEGER NOT NULL DEFAULT 100, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id_loyalty_program"));
CREATE TABLE "loyalty_accounts" ("id_loyalty_account" SERIAL NOT NULL, "user_id" INTEGER NOT NULL, "place_id" INTEGER NOT NULL, "balance" INTEGER NOT NULL DEFAULT 0, "lifetime_points" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id_loyalty_account"));
CREATE TABLE "loyalty_transactions" ("id_loyalty_transaction" SERIAL NOT NULL, "user_id" INTEGER NOT NULL, "place_id" INTEGER NOT NULL, "reservation_id" INTEGER, "type" "LoyaltyTransactionType" NOT NULL, "points" INTEGER NOT NULL, "note" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id_loyalty_transaction"));

CREATE UNIQUE INDEX "loyalty_programs_place_id_key" ON "loyalty_programs"("place_id");
CREATE UNIQUE INDEX "loyalty_accounts_user_id_place_id_key" ON "loyalty_accounts"("user_id", "place_id");
CREATE INDEX "loyalty_accounts_place_id_balance_idx" ON "loyalty_accounts"("place_id", "balance");
CREATE UNIQUE INDEX "loyalty_transactions_reservation_id_key" ON "loyalty_transactions"("reservation_id");
CREATE INDEX "loyalty_transactions_user_id_created_at_idx" ON "loyalty_transactions"("user_id", "created_at");
CREATE INDEX "loyalty_transactions_place_id_created_at_idx" ON "loyalty_transactions"("place_id", "created_at");

ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id_place") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id_reservation") ON DELETE SET NULL ON UPDATE CASCADE;
