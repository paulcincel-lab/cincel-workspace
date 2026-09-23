-- Custom task statuses stop being variants of a base status (#399 follow-up):
-- a status either closes the task (counts as finished) or keeps it open.
ALTER TABLE "core"."task_statuses" ADD COLUMN "closes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "core"."task_statuses" SET "closes" = true WHERE "base_status" = 'completado';--> statement-breakpoint
-- Tasks in a custom status: finished if it closes, otherwise open (en_proceso).
UPDATE "core"."tasks" t SET "status" = CASE WHEN s."closes" THEN 'completado'::"core"."task_status" ELSE 'en_proceso'::"core"."task_status" END
FROM "core"."task_statuses" s WHERE t."custom_status_id" = s."id";--> statement-breakpoint
ALTER TABLE "core"."task_statuses" DROP COLUMN "base_status";
