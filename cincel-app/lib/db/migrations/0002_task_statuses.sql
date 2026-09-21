CREATE TABLE "core"."task_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_status" "core"."task_status" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD COLUMN "custom_status_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "task_statuses_name_lower_uq" ON "core"."task_statuses" USING btree (lower("name")) WHERE "core"."task_statuses"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_custom_status_id_task_statuses_id_fk" FOREIGN KEY ("custom_status_id") REFERENCES "core"."task_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tasks_custom_status_id" ON "core"."tasks" USING btree ("custom_status_id");