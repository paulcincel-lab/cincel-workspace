CREATE TYPE "core"."attendee_response" AS ENUM('pendiente', 'acepta', 'rechaza', 'tentativo');--> statement-breakpoint
CREATE TYPE "core"."calendar_event_source" AS ENUM('cincel', 'google');--> statement-breakpoint
CREATE TYPE "core"."calendar_event_status" AS ENUM('confirmada', 'cancelada');--> statement-breakpoint
CREATE TYPE "core"."meeting_minutes_status" AS ENUM('borrador', 'lista', 'enviada');--> statement-breakpoint
CREATE TYPE "core"."proposal_kind" AS ENUM('mover_tareas', 'crear_reunion', 'editar_reunion', 'cancelar_reunion', 'repartir', 'resolver_traslape', 'pasar_a_manana', 'planear_semana', 'crear_tareas_minuta');--> statement-breakpoint
CREATE TYPE "core"."proposal_status" AS ENUM('propuesta', 'aplicada', 'parcial', 'cancelada', 'expirada', 'deshecha');--> statement-breakpoint
ALTER TYPE "core"."history_entity" ADD VALUE 'calendar_event';--> statement-breakpoint
ALTER TYPE "core"."notification_kind" ADD VALUE 'reunion';--> statement-breakpoint
CREATE TABLE "core"."assistant_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"thread_id" uuid,
	"tool_call_id" text,
	"kind" "core"."proposal_kind" NOT NULL,
	"status" "core"."proposal_status" DEFAULT 'propuesta' NOT NULL,
	"title" text NOT NULL,
	"line" text NOT NULL,
	"range_from" date,
	"range_to" date,
	"changes" jsonb NOT NULL,
	"deferred" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"undo_token" text,
	"undo_expires_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."calendar_event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"staff_id" uuid,
	"contact_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"response" "core"."attendee_response" DEFAULT 'pendiente' NOT NULL,
	"is_organizer" boolean DEFAULT false NOT NULL,
	"optional" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "core"."calendar_event_source" NOT NULL,
	"owner_staff_id" uuid,
	"organizer_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"time_zone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"location" text,
	"meet_url" text,
	"project_id" uuid,
	"workflow_id" uuid,
	"status" "core"."calendar_event_status" DEFAULT 'confirmada' NOT NULL,
	"google_calendar_id" text,
	"google_event_id" text,
	"google_etag" text,
	"google_html_link" text,
	"google_sync_error" text,
	"invites_via" text,
	"synced_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "calendar_events_time_check" CHECK ("core"."calendar_events"."ends_at" > "core"."calendar_events"."starts_at"),
	CONSTRAINT "calendar_events_invites_via_check" CHECK ("core"."calendar_events"."invites_via" is null or "core"."calendar_events"."invites_via" in ('google', 'cincel'))
);
--> statement-breakpoint
CREATE TABLE "core"."meeting_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minutes_id" uuid NOT NULL,
	"project_id" uuid,
	"text" text NOT NULL,
	"history_event_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_decisions_text_check" CHECK (char_length("core"."meeting_decisions"."text") <= 500)
);
--> statement-breakpoint
CREATE TABLE "core"."meeting_minute_tasks" (
	"minutes_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	CONSTRAINT "meeting_minute_tasks_minutes_id_task_id_pk" PRIMARY KEY("minutes_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "core"."meeting_minutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"project_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"status" "core"."meeting_minutes_status" DEFAULT 'borrador' NOT NULL,
	"open_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_minutes_event_uq" UNIQUE("event_id"),
	CONSTRAINT "meeting_minutes_notes_check" CHECK (char_length("core"."meeting_minutes"."notes") <= 20000)
);
--> statement-breakpoint
ALTER TABLE "core"."workflow_task_templates" ADD COLUMN "default_estimated_hours" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD COLUMN "estimated_hours" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "core"."google_calendar_syncs" ADD COLUMN "primary_sync_token" text;--> statement-breakpoint
ALTER TABLE "core"."google_calendar_syncs" ADD COLUMN "primary_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."google_calendar_syncs" ADD COLUMN "primary_error" text;--> statement-breakpoint
ALTER TABLE "core"."google_calendar_syncs" ADD COLUMN "primary_window_from" date;--> statement-breakpoint
ALTER TABLE "core"."google_calendar_syncs" ADD COLUMN "primary_window_to" date;--> statement-breakpoint
ALTER TABLE "core"."assistant_proposals" ADD CONSTRAINT "assistant_proposals_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."assistant_proposals" ADD CONSTRAINT "assistant_proposals_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "core"."assistant_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "core"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "core"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_owner_staff_id_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_organizer_id_staff_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."meeting_decisions" ADD CONSTRAINT "meeting_decisions_minutes_id_meeting_minutes_id_fk" FOREIGN KEY ("minutes_id") REFERENCES "core"."meeting_minutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."meeting_decisions" ADD CONSTRAINT "meeting_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."meeting_decisions" ADD CONSTRAINT "meeting_decisions_history_event_id_history_events_id_fk" FOREIGN KEY ("history_event_id") REFERENCES "core"."history_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."meeting_minute_tasks" ADD CONSTRAINT "meeting_minute_tasks_minutes_id_meeting_minutes_id_fk" FOREIGN KEY ("minutes_id") REFERENCES "core"."meeting_minutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."meeting_minute_tasks" ADD CONSTRAINT "meeting_minute_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "core"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."meeting_minutes" ADD CONSTRAINT "meeting_minutes_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "core"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."meeting_minutes" ADD CONSTRAINT "meeting_minutes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."meeting_minutes" ADD CONSTRAINT "meeting_minutes_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_proposals_undo_token_uq" ON "core"."assistant_proposals" USING btree ("undo_token");--> statement-breakpoint
CREATE INDEX "idx_assistant_proposals_staff" ON "core"."assistant_proposals" USING btree ("staff_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_assistant_proposals_status" ON "core"."assistant_proposals" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_attendees_email_uq" ON "core"."calendar_event_attendees" USING btree ("event_id",lower("email"));--> statement-breakpoint
CREATE INDEX "idx_calendar_event_attendees_staff" ON "core"."calendar_event_attendees" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_starts" ON "core"."calendar_events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_project_starts" ON "core"."calendar_events" USING btree ("project_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_owner_starts" ON "core"."calendar_events" USING btree ("owner_staff_id","starts_at") WHERE "core"."calendar_events"."source" = 'google';--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_google_owner_uq" ON "core"."calendar_events" USING btree ("owner_staff_id","google_event_id") WHERE "core"."calendar_events"."source" = 'google';--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_cincel_google_uq" ON "core"."calendar_events" USING btree ("google_event_id") WHERE "core"."calendar_events"."source" = 'cincel' and "core"."calendar_events"."google_event_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_meeting_decisions_minutes" ON "core"."meeting_decisions" USING btree ("minutes_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_meeting_minute_tasks_task" ON "core"."meeting_minute_tasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_due" ON "core"."tasks" USING btree ((coalesce("commitment_date", "delivery_date"))) WHERE "core"."tasks"."deleted_at" is null and "core"."tasks"."archived" = false;--> statement-breakpoint
ALTER TABLE "core"."workflow_task_templates" ADD CONSTRAINT "workflow_task_templates_estimated_hours_check" CHECK ("core"."workflow_task_templates"."default_estimated_hours" is null or ("core"."workflow_task_templates"."default_estimated_hours" > 0 and "core"."workflow_task_templates"."default_estimated_hours" <= 80));--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_estimated_hours_check" CHECK ("core"."tasks"."estimated_hours" is null or ("core"."tasks"."estimated_hours" > 0 and "core"."tasks"."estimated_hours" <= 80));