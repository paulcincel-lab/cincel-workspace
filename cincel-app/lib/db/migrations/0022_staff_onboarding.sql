ALTER TABLE "core"."staff" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "core"."staff" AS s SET "onboarding_completed_at" = now()
WHERE s."last_login_at" IS NOT NULL
  OR EXISTS (SELECT 1 FROM "core"."auth_credentials" AS c WHERE c."staff_id" = s."id" AND c."last_login_at" IS NOT NULL);
