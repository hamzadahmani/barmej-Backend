-- Suspension des comptes (backoffice) et suppression possible des comptes Pro :
-- l'historique des actions est gardé sans auteur quand un compte est supprimé.
ALTER TABLE "users" ADD COLUMN "suspended_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "suspended_reason" TEXT;

ALTER TABLE "audit_logs" ALTER COLUMN "actor_id" DROP NOT NULL;
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;
