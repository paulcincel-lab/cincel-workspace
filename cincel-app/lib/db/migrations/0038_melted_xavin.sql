CREATE TYPE "core"."support_event_type" AS ENUM('created', 'status', 'priority', 'assignee', 'reply', 'note', 'published', 'synced', 'duplicate');--> statement-breakpoint
CREATE TYPE "core"."support_event_visibility" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TYPE "core"."support_ticket_kind" AS ENUM('error', 'mejora', 'pregunta');--> statement-breakpoint
CREATE TYPE "core"."support_ticket_priority" AS ENUM('baja', 'media', 'alta');--> statement-breakpoint
CREATE TYPE "core"."support_ticket_status" AS ENUM('nuevo', 'en_revision', 'planeado', 'en_progreso', 'resuelto', 'descartado');--> statement-breakpoint
CREATE SEQUENCE "core"."support_ticket_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "core"."support_ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."support_ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" "core"."support_event_type" NOT NULL,
	"visibility" "core"."support_event_visibility" DEFAULT 'public' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text DEFAULT 'SOL-' || lpad(nextval('core.support_ticket_seq')::text, 4, '0') NOT NULL,
	"kind" "core"."support_ticket_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"steps" text,
	"area" text DEFAULT 'otro' NOT NULL,
	"context" jsonb NOT NULL,
	"status" "core"."support_ticket_status" DEFAULT 'nuevo' NOT NULL,
	"priority" "core"."support_ticket_priority",
	"created_by" uuid NOT NULL,
	"assignee_id" uuid,
	"duplicate_of" uuid,
	"github_issue_number" integer,
	"github_issue_url" text,
	"github_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "support_tickets_code_unique" UNIQUE("code"),
	CONSTRAINT "support_tickets_title_len_check" CHECK (char_length("core"."support_tickets"."title") between 4 and 120),
	CONSTRAINT "support_tickets_not_own_duplicate_check" CHECK ("core"."support_tickets"."duplicate_of" is null or "core"."support_tickets"."duplicate_of" <> "core"."support_tickets"."id")
);
--> statement-breakpoint
ALTER TABLE "core"."support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "core"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "core"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."support_ticket_events" ADD CONSTRAINT "support_ticket_events_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."support_tickets" ADD CONSTRAINT "support_tickets_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."support_tickets" ADD CONSTRAINT "support_tickets_assignee_id_staff_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."support_tickets" ADD CONSTRAINT "support_tickets_duplicate_of_support_tickets_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "core"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_support_ticket_attachments_ticket" ON "core"."support_ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_support_ticket_events_ticket" ON "core"."support_ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_author" ON "core"."support_tickets" USING btree ("created_by","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_support_tickets_status" ON "core"."support_tickets" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_support_tickets_github" ON "core"."support_tickets" USING btree ("github_issue_number") WHERE "core"."support_tickets"."github_issue_number" is not null;