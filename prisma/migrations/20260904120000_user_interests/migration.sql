ALTER TABLE "users"
ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "onboarding_completed_at" TIMESTAMP(3);
