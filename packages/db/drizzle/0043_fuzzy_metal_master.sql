ALTER TABLE "users" ADD COLUMN "password_auth_enabled" boolean DEFAULT true NOT NULL;
UPDATE "users" SET "password_auth_enabled" = false WHERE "github_id" IS NOT NULL;
