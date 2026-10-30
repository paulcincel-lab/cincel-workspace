CREATE TYPE "core"."group_mapping_kind" AS ENUM('role', 'area');--> statement-breakpoint
CREATE TABLE "core"."workspace_group_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_email" text NOT NULL,
	"group_id" text NOT NULL,
	"kind" "core"."group_mapping_kind" NOT NULL,
	"role" text,
	"area_id" uuid,
	"rank" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_group_mappings_kind_check" CHECK (("core"."workspace_group_mappings"."kind" = 'role' and "core"."workspace_group_mappings"."role" is not null and "core"."workspace_group_mappings"."area_id" is null) or ("core"."workspace_group_mappings"."kind" = 'area' and "core"."workspace_group_mappings"."area_id" is not null and "core"."workspace_group_mappings"."role" is null))
);
--> statement-breakpoint
CREATE TABLE "core"."auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"staff_id" uuid,
	"email" text,
	"reason" text,
	"ip" text,
	"user_agent" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."area_members" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."staff" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "core"."staff" ADD COLUMN "access_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."staff" ADD COLUMN "access_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."staff" ADD COLUMN "access_revoked_reason" text;--> statement-breakpoint
ALTER TABLE "core"."staff" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."google_oauth_accounts" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "core"."workspace_group_mappings" ADD CONSTRAINT "workspace_group_mappings_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "core"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."auth_events" ADD CONSTRAINT "auth_events_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_group_mappings_group_uq" ON "core"."workspace_group_mappings" USING btree ("group_id","kind");--> statement-breakpoint
CREATE INDEX "idx_auth_events_at" ON "core"."auth_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "idx_auth_events_staff_id" ON "core"."auth_events" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_google_sub_uq" ON "core"."staff" USING btree ("google_sub") WHERE "core"."staff"."google_sub" is not null and "core"."staff"."deleted_at" is null;