-- Redesign contracts: every redesign table, enum and column (BE §3, §4). One migration, generated
-- with drizzle-kit generate; never renumbered (regenerate on top if another migration lands first).
-- Hand edits after generation:
--   * history_entity ADD VALUE uses IF NOT EXISTS (BE §4); the new values aren't used in this transaction.
--   * time_entries.source is qualified as "core"."time_entry_source" (drizzle-kit drops the schema for type
--     names that start with "time"; the snapshot already has typeSchema core).
--   * Seeds appended at the end (BE §4): app_settings appearance.theme, time_tracking and vacations, only when
--     missing. appearance.primary_color is not read or changed here.
CREATE TYPE "core"."assistant_action_status" AS ENUM('proposed', 'confirmed', 'cancelled', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "core"."assistant_role" AS ENUM('user', 'assistant', 'system', 'tool');--> statement-breakpoint
CREATE TYPE "core"."color_mode" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "core"."density" AS ENUM('comoda', 'compacta');--> statement-breakpoint
CREATE TYPE "core"."note_color" AS ENUM('neutral', 'blue', 'amber', 'violet', 'cyan');--> statement-breakpoint
CREATE TYPE "core"."notification_email_status" AS ENUM('none', 'pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "core"."notification_kind" AS ENUM('asignacion', 'mencion', 'vencimiento', 'comentario', 'aprobacion_cliente', 'recordatorio', 'sistema');--> statement-breakpoint
CREATE TYPE "core"."presentation_style" AS ENUM('visual', 'esencial', 'analitico');--> statement-breakpoint
CREATE TYPE "core"."reminder_repeat" AS ENUM('none', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "core"."theme_id" AS ENUM('azul', 'calido', 'grafito');--> statement-breakpoint
CREATE TYPE "core"."time_entry_source" AS ENUM('sidebar', 'login', 'assistant', 'auto_close');--> statement-breakpoint
CREATE TYPE "core"."vacation_kind" AS ENUM('vacaciones', 'personal', 'enfermedad');--> statement-breakpoint
CREATE TYPE "core"."vacation_status" AS ENUM('pendiente', 'aprobada', 'rechazada', 'cancelada');--> statement-breakpoint
ALTER TYPE "core"."history_entity" ADD VALUE IF NOT EXISTS 'note';--> statement-breakpoint
ALTER TYPE "core"."history_entity" ADD VALUE IF NOT EXISTS 'reminder';--> statement-breakpoint
ALTER TYPE "core"."history_entity" ADD VALUE IF NOT EXISTS 'time_entry';--> statement-breakpoint
ALTER TYPE "core"."history_entity" ADD VALUE IF NOT EXISTS 'vacation_request';--> statement-breakpoint
CREATE TABLE "core"."cron_leases" (
	"job" text PRIMARY KEY NOT NULL,
	"locked_until" timestamp with time zone DEFAULT 'epoch' NOT NULL,
	"owner" text
);
--> statement-breakpoint
CREATE TABLE "core"."cron_runs" (
	"job" text NOT NULL,
	"window_key" text NOT NULL,
	"status" text NOT NULL,
	"detail" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "cron_runs_job_window_key_pk" PRIMARY KEY("job","window_key")
);
--> statement-breakpoint
CREATE TABLE "core"."staff_photos" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_photos_mime_check" CHECK ("core"."staff_photos"."mime" in ('image/jpeg','image/png','image/webp')),
	CONSTRAINT "staff_photos_size_check" CHECK (octet_length("core"."staff_photos"."bytes") <= 1048576)
);
--> statement-breakpoint
CREATE TABLE "core"."user_preferences" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"theme" "core"."theme_id",
	"mode" "core"."color_mode" DEFAULT 'system' NOT NULL,
	"style" "core"."presentation_style",
	"density" "core"."density" DEFAULT 'comoda' NOT NULL,
	"text_size" numeric(3, 1) DEFAULT 14 NOT NULL,
	"redesign_enabled" boolean,
	"quiet_from" time,
	"quiet_to" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_text_size_check" CHECK ("core"."user_preferences"."text_size" in (13, 13.5, 14, 14.5, 15, 15.5, 16)),
	CONSTRAINT "user_preferences_quiet_pair_check" CHECK (("core"."user_preferences"."quiet_from" is null) = ("core"."user_preferences"."quiet_to" is null))
);
--> statement-breakpoint
CREATE TABLE "core"."notification_preferences" (
	"staff_id" uuid NOT NULL,
	"kind" "core"."notification_kind" NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	"digest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_staff_id_kind_pk" PRIMARY KEY("staff_id","kind")
);
--> statement-breakpoint
CREATE TABLE "core"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"kind" "core"."notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"entity" "core"."history_entity",
	"entity_id" uuid,
	"url" text,
	"dedupe_key" text,
	"in_app" boolean NOT NULL,
	"email_status" "core"."notification_email_status" DEFAULT 'none' NOT NULL,
	"digest" boolean DEFAULT false NOT NULL,
	"digested_at" timestamp with time zone,
	"deliver_after" timestamp with time zone DEFAULT now() NOT NULL,
	"emailed_at" timestamp with time zone,
	"email_error" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_entity_pair_check" CHECK (("core"."notifications"."entity" is null) = ("core"."notifications"."entity_id" is null)),
	CONSTRAINT "notifications_delivery_check" CHECK ("core"."notifications"."in_app" or "core"."notifications"."email_status" <> 'none' or "core"."notifications"."digest")
);
--> statement-breakpoint
CREATE TABLE "core"."checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_items_text_check" CHECK (length(trim("core"."checklist_items"."text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"title" text NOT NULL,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"color" "core"."note_color" DEFAULT 'neutral' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "notes_not_empty_check" CHECK (length("core"."notes"."title") > 0 or length("core"."notes"."body") > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"text" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"repeat" "core"."reminder_repeat" DEFAULT 'none' NOT NULL,
	"channels" text[] DEFAULT '{app}'::text[] NOT NULL,
	"task_id" uuid,
	"project_id" uuid,
	"fired_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_channels_check" CHECK ("core"."reminders"."channels" <@ array['app','email']::text[] and cardinality("core"."reminders"."channels") > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."gmail_accounts" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"history_id" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"next_sync_after" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."gmail_threads" (
	"id" text NOT NULL,
	"staff_id" uuid NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"from_email" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"unread" boolean DEFAULT true NOT NULL,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"project_id" uuid,
	"suggested_project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_threads_staff_id_id_pk" PRIMARY KEY("staff_id","id")
);
--> statement-breakpoint
CREATE TABLE "core"."time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"pauses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" "core"."time_entry_source" NOT NULL,
	"closed_by" text,
	"flagged" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_order_check" CHECK ("core"."time_entries"."ended_at" is null or "core"."time_entries"."ended_at" >= "core"."time_entries"."started_at"),
	CONSTRAINT "time_entries_closed_by_check" CHECK (("core"."time_entries"."ended_at" is null) = ("core"."time_entries"."closed_by" is null))
);
--> statement-breakpoint
CREATE TABLE "core"."vacation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"kind" "core"."vacation_kind" NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"days" integer NOT NULL,
	"status" "core"."vacation_status" DEFAULT 'pendiente' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vacation_requests_range_check" CHECK ("core"."vacation_requests"."to_date" >= "core"."vacation_requests"."from_date"),
	CONSTRAINT "vacation_requests_days_check" CHECK ("core"."vacation_requests"."days" > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."assistant_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" "core"."assistant_action_status" DEFAULT 'proposed' NOT NULL,
	"result" jsonb,
	"error" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."assistant_messages" (
	"id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "core"."assistant_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_messages_thread_id_id_pk" PRIMARY KEY("thread_id","id")
);
--> statement-breakpoint
CREATE TABLE "core"."assistant_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"title" text DEFAULT 'Nueva conversación' NOT NULL,
	"context" jsonb,
	"imported_from" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "core"."staff_profiles" ADD COLUMN "vacation_days" integer;--> statement-breakpoint
ALTER TABLE "core"."staff_photos" ADD CONSTRAINT "staff_photos_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."user_preferences" ADD CONSTRAINT "user_preferences_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notification_preferences" ADD CONSTRAINT "notification_preferences_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "core"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."checklists" ADD CONSTRAINT "checklists_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."checklists" ADD CONSTRAINT "checklists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notes" ADD CONSTRAINT "notes_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notes" ADD CONSTRAINT "notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."reminders" ADD CONSTRAINT "reminders_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."reminders" ADD CONSTRAINT "reminders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "core"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."reminders" ADD CONSTRAINT "reminders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."gmail_accounts" ADD CONSTRAINT "gmail_accounts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."gmail_threads" ADD CONSTRAINT "gmail_threads_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."gmail_threads" ADD CONSTRAINT "gmail_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."gmail_threads" ADD CONSTRAINT "gmail_threads_suggested_project_id_projects_id_fk" FOREIGN KEY ("suggested_project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."time_entries" ADD CONSTRAINT "time_entries_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."vacation_requests" ADD CONSTRAINT "vacation_requests_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."vacation_requests" ADD CONSTRAINT "vacation_requests_decided_by_staff_id_fk" FOREIGN KEY ("decided_by") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assistant_actions" ADD CONSTRAINT "assistant_actions_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "core"."assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assistant_actions" ADD CONSTRAINT "assistant_actions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assistant_messages" ADD CONSTRAINT "assistant_messages_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "core"."assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assistant_threads" ADD CONSTRAINT "assistant_threads_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notifications_inbox" ON "core"."notifications" USING btree ("staff_id","created_at") WHERE "core"."notifications"."in_app";--> statement-breakpoint
CREATE INDEX "idx_notifications_unread" ON "core"."notifications" USING btree ("staff_id") WHERE "core"."notifications"."in_app" and "core"."notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "idx_notifications_email_pending" ON "core"."notifications" USING btree ("deliver_after") WHERE "core"."notifications"."email_status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_notifications_digest_pending" ON "core"."notifications" USING btree ("staff_id") WHERE "core"."notifications"."digest" and "core"."notifications"."digested_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "core"."notifications" USING btree ("staff_id","dedupe_key") WHERE "core"."notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "idx_checklist_items_list" ON "core"."checklist_items" USING btree ("checklist_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_checklists_staff_live" ON "core"."checklists" USING btree ("staff_id") WHERE "core"."checklists"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_checklists_project" ON "core"."checklists" USING btree ("project_id") WHERE "core"."checklists"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_notes_staff_live" ON "core"."notes" USING btree ("staff_id","pinned","updated_at") WHERE "core"."notes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_notes_project" ON "core"."notes" USING btree ("project_id") WHERE "core"."notes"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_reminders_due_open" ON "core"."reminders" USING btree ("due_at") WHERE "core"."reminders"."fired_at" is null and "core"."reminders"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "idx_reminders_staff" ON "core"."reminders" USING btree ("staff_id","due_at");--> statement-breakpoint
CREATE INDEX "idx_reminders_task" ON "core"."reminders" USING btree ("task_id") WHERE "core"."reminders"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_reminders_project" ON "core"."reminders" USING btree ("project_id") WHERE "core"."reminders"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_gmail_threads_staff_received" ON "core"."gmail_threads" USING btree ("staff_id","received_at");--> statement-breakpoint
CREATE INDEX "idx_gmail_threads_project" ON "core"."gmail_threads" USING btree ("project_id") WHERE "core"."gmail_threads"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_gmail_threads_suggested_project" ON "core"."gmail_threads" USING btree ("suggested_project_id") WHERE "core"."gmail_threads"."suggested_project_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_open_uq" ON "core"."time_entries" USING btree ("staff_id") WHERE "core"."time_entries"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "idx_time_entries_staff_date" ON "core"."time_entries" USING btree ("staff_id","work_date");--> statement-breakpoint
CREATE INDEX "idx_time_entries_date" ON "core"."time_entries" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "idx_vacation_requests_staff" ON "core"."vacation_requests" USING btree ("staff_id","from_date");--> statement-breakpoint
CREATE INDEX "idx_vacation_requests_decided_by" ON "core"."vacation_requests" USING btree ("decided_by");--> statement-breakpoint
CREATE INDEX "idx_vacation_requests_range" ON "core"."vacation_requests" USING btree ("from_date","to_date") WHERE "core"."vacation_requests"."status" in ('pendiente','aprobada');--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_actions_call_uq" ON "core"."assistant_actions" USING btree ("thread_id","tool_call_id");--> statement-breakpoint
CREATE INDEX "idx_assistant_actions_staff" ON "core"."assistant_actions" USING btree ("staff_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_assistant_messages_thread" ON "core"."assistant_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_assistant_threads_staff" ON "core"."assistant_threads" USING btree ("staff_id","updated_at") WHERE "core"."assistant_threads"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "core"."staff_profiles" ADD CONSTRAINT "staff_profiles_vacation_days_check" CHECK ("core"."staff_profiles"."vacation_days" is null or "core"."staff_profiles"."vacation_days" >= 0);--> statement-breakpoint
INSERT INTO "core"."app_settings" ("key", "value") VALUES ('appearance.theme', '{"version":1,"data":{"baseTheme":"azul","tokens":{"background":{"light":"#f1f4f9","dark":"#0f1115"},"foreground":{"light":"#0f172a","dark":"#e8ebf0"},"card":{"light":"#ffffff","dark":"#1a1e24"},"card-foreground":{"light":"#0f172a","dark":"#e8ebf0"},"popover":{"light":"#ffffff","dark":"#1a1e24"},"popover-foreground":{"light":"#0f172a","dark":"#e8ebf0"},"primary":{"light":"#2563eb","dark":"#60a5fa"},"primary-foreground":{"light":"#ffffff","dark":"#0b1220"},"secondary":{"light":"#dbeafe","dark":"#1e2a44"},"secondary-foreground":{"light":"#1d4ed8","dark":"#93b4fb"},"muted":{"light":"#f1f5f9","dark":"#232830"},"muted-foreground":{"light":"#606f86","dark":"#9aa3ae"},"accent":{"light":"#eef2f7","dark":"#232830"},"accent-foreground":{"light":"#0f172a","dark":"#e8ebf0"},"destructive":{"light":"#d81844","dark":"#fb7185"},"warning":{"light":"#b45309","dark":"#fbbf24"},"warning-ink":{"light":"#b45309","dark":"#fbbf24"},"success":{"light":"#047857","dark":"#34d399"},"border":{"light":"#e5eaf1","dark":"#2a2f37"},"border-strong":{"light":"#8b939f","dark":"#636a77"},"input":{"light":"#e2e8f0","dark":"#2a2f37"},"ring":{"light":"#2563eb","dark":"#60a5fa"},"chart-1":{"light":"#3b82f6","dark":"#60a5fa"},"chart-2":{"light":"#8b5cf6","dark":"#a78bfa"},"chart-3":{"light":"#ce8300","dark":"#fbbf24"},"chart-4":{"light":"#00a0bc","dark":"#22d3ee"},"chart-5":{"light":"#04a874","dark":"#34d399"},"chart-1-ink":{"light":"#1d4ed8","dark":"#93b4fb"},"chart-2-ink":{"light":"#6d28d9","dark":"#c4b0fb"},"chart-3-ink":{"light":"#af5006","dark":"#f5c56b"},"chart-4-ink":{"light":"#0e7490","dark":"#67d6e6"},"chart-5-ink":{"light":"#047857","dark":"#6ee7b7"},"sidebar":{"light":"#f8fafc","dark":"#14171c"},"sidebar-foreground":{"light":"#334155","dark":"#c3c9d2"},"sidebar-primary":{"light":"#2563eb","dark":"#60a5fa"},"sidebar-primary-foreground":{"light":"#ffffff","dark":"#0b1220"},"sidebar-accent":{"light":"#eef2f7","dark":"#1d2128"},"sidebar-accent-foreground":{"light":"#0f172a","dark":"#e8ebf0"},"sidebar-border":{"light":"#e2e8f0","dark":"#2a2f37"},"sidebar-ring":{"light":"#2563eb","dark":"#60a5fa"}},"typeScale":{"pageTitle":{"size":22,"weight":600},"sectionTitle":{"size":16,"weight":600},"cardTitle":{"size":14,"weight":500},"body":{"size":14,"weight":400},"label":{"size":12,"weight":500},"kpi":{"size":28,"weight":500}},"fontFamily":"Geist","shape":{"radius":14,"cardPadding":20,"gap":16,"shadow":"suave"},"styleDefault":"visual","allowUserOverride":true,"redesignDefault":false,"redesignAvailable":true,"v":1}}') ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."app_settings" ("key", "value") VALUES ('time_tracking', '{"version":1,"data":{"enabled":false,"requiredFrom":null,"dayStart":"09:00","dayEnd":"18:00","hoursPerDay":8,"lateToleranceMin":15,"workDays":[1,2,3,4,5],"promptAtLogin":true,"autoCloseAt":"20:00","lunchMinutes":60,"exemptRoles":[]}}') ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."app_settings" ("key", "value") VALUES ('vacations', '{"version":1,"data":{"daysPerYear":12}}') ON CONFLICT ("key") DO NOTHING;
