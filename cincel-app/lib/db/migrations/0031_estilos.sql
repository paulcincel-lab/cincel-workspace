CREATE TABLE "core"."resource_link_opens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_link_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."positions" ADD COLUMN "weekly_capacity_hours" integer;--> statement-breakpoint
ALTER TABLE "core"."workflows" ADD COLUMN "color_slot" smallint;--> statement-breakpoint
ALTER TABLE "core"."drive_files" ADD COLUMN "size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "cover_drive_file_id" text;--> statement-breakpoint
ALTER TABLE "core"."assistant_messages" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "core"."assistant_threads" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."assistant_threads" ADD COLUMN "last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."assistant_threads" ADD COLUMN "tool_call_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."resource_link_opens" ADD CONSTRAINT "resource_link_opens_resource_link_id_resource_links_id_fk" FOREIGN KEY ("resource_link_id") REFERENCES "core"."resource_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."resource_link_opens" ADD CONSTRAINT "resource_link_opens_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_resource_link_opens_link_at" ON "core"."resource_link_opens" USING btree ("resource_link_id","opened_at");--> statement-breakpoint
CREATE INDEX "idx_resource_link_opens_staff_at" ON "core"."resource_link_opens" USING btree ("staff_id","opened_at");--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD CONSTRAINT "resource_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_resource_links_project_id" ON "core"."resource_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_assistant_threads_staff_pinned" ON "core"."assistant_threads" USING btree ("staff_id","pinned_at" DESC NULLS LAST,"updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "core"."positions" ADD CONSTRAINT "positions_weekly_capacity_hours_check" CHECK ("core"."positions"."weekly_capacity_hours" is null or "core"."positions"."weekly_capacity_hours" between 0 and 80);--> statement-breakpoint
ALTER TABLE "core"."workflows" ADD CONSTRAINT "workflows_color_slot_check" CHECK ("core"."workflows"."color_slot" is null or "core"."workflows"."color_slot" between 1 and 5);