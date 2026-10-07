CREATE TABLE "refresh_tokens" (
  "id" SERIAL NOT NULL,
  "token_hash" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "replaced_by_token_hash" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;
