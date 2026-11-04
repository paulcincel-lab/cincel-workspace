CREATE TYPE "core"."portal_file_action" AS ENUM('download', 'preview', 'upload');--> statement-breakpoint
CREATE TYPE "core"."portal_user_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TABLE "core"."portal_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"project_id" uuid,
	"staff_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."portal_file_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"drive_file_id" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint,
	"action" "core"."portal_file_action" NOT NULL,
	"ip" text,
	"user_agent" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."portal_login_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"return_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_login_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "core"."portal_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "core"."portal_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" "core"."portal_user_status" DEFAULT 'invited' NOT NULL,
	"invited_by_staff_id" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"disabled_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."project_portal_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"granted_by_staff_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by_staff_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."portal_audit_events" ADD CONSTRAINT "portal_audit_events_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "core"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_audit_events" ADD CONSTRAINT "portal_audit_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_audit_events" ADD CONSTRAINT "portal_audit_events_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_file_events" ADD CONSTRAINT "portal_file_events_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "core"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_file_events" ADD CONSTRAINT "portal_file_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_login_links" ADD CONSTRAINT "portal_login_links_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "core"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_sessions" ADD CONSTRAINT "portal_sessions_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "core"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_users" ADD CONSTRAINT "portal_users_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "core"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_users" ADD CONSTRAINT "portal_users_invited_by_staff_id_staff_id_fk" FOREIGN KEY ("invited_by_staff_id") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."portal_users" ADD CONSTRAINT "portal_users_disabled_by_staff_id_staff_id_fk" FOREIGN KEY ("disabled_by_staff_id") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_portal_access" ADD CONSTRAINT "project_portal_access_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_portal_access" ADD CONSTRAINT "project_portal_access_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "core"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_portal_access" ADD CONSTRAINT "project_portal_access_granted_by_staff_id_staff_id_fk" FOREIGN KEY ("granted_by_staff_id") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_portal_access" ADD CONSTRAINT "project_portal_access_revoked_by_staff_id_staff_id_fk" FOREIGN KEY ("revoked_by_staff_id") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_portal_audit_events_user_at" ON "core"."portal_audit_events" USING btree ("portal_user_id","at");--> statement-breakpoint
CREATE INDEX "idx_portal_file_events_project_at" ON "core"."portal_file_events" USING btree ("project_id","at");--> statement-breakpoint
CREATE INDEX "idx_portal_file_events_user_at" ON "core"."portal_file_events" USING btree ("portal_user_id","at");--> statement-breakpoint
CREATE INDEX "idx_portal_login_links_user" ON "core"."portal_login_links" USING btree ("portal_user_id");--> statement-breakpoint
CREATE INDEX "idx_portal_login_links_expires_at" ON "core"."portal_login_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_portal_sessions_user" ON "core"."portal_sessions" USING btree ("portal_user_id");--> statement-breakpoint
CREATE INDEX "idx_portal_sessions_expires_at" ON "core"."portal_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_email_lower_uq" ON "core"."portal_users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "project_portal_access_active_uq" ON "core"."project_portal_access" USING btree ("project_id","portal_user_id") WHERE "core"."project_portal_access"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "idx_project_portal_access_user" ON "core"."project_portal_access" USING btree ("portal_user_id");