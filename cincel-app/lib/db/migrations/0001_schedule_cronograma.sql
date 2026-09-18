CREATE TYPE "core"."schedule_task_status" AS ENUM('pending', 'progress', 'done');--> statement-breakpoint
CREATE TABLE "core"."project_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_file_name" text,
	"payment_calendar_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."schedule_adicionales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"partida" text NOT NULL,
	"items" text[] NOT NULL,
	"quote_ref" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."schedule_imprevistos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"texto" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."schedule_payment_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"pagado_pct" numeric(5, 2) NOT NULL,
	"avance_pct" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."schedule_task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"task_stable_key" text NOT NULL,
	"from" "core"."schedule_task_status" NOT NULL,
	"to" "core"."schedule_task_status" NOT NULL,
	"user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."schedule_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"legacy_id" text,
	"planta" text NOT NULL,
	"seccion" text NOT NULL,
	"seccion_order" integer NOT NULL,
	"responsable" text,
	"responsable_contact_id" uuid,
	"inicio" date NOT NULL,
	"fin" date NOT NULL,
	"tarea" text NOT NULL,
	"status" "core"."schedule_task_status" DEFAULT 'pending' NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"status_updated_at" timestamp with time zone,
	"status_updated_by" uuid,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."project_schedules" ADD CONSTRAINT "project_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."schedule_adicionales" ADD CONSTRAINT "schedule_adicionales_schedule_id_project_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "core"."project_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."schedule_imprevistos" ADD CONSTRAINT "schedule_imprevistos_schedule_id_project_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "core"."project_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."schedule_imprevistos" ADD CONSTRAINT "schedule_imprevistos_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."schedule_payment_rows" ADD CONSTRAINT "schedule_payment_rows_schedule_id_project_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "core"."project_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."schedule_task_events" ADD CONSTRAINT "schedule_task_events_user_id_staff_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."schedule_tasks" ADD CONSTRAINT "schedule_tasks_schedule_id_project_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "core"."project_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."schedule_tasks" ADD CONSTRAINT "schedule_tasks_responsable_contact_id_contacts_id_fk" FOREIGN KEY ("responsable_contact_id") REFERENCES "core"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."schedule_tasks" ADD CONSTRAINT "schedule_tasks_status_updated_by_staff_id_fk" FOREIGN KEY ("status_updated_by") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_schedules_project_uq" ON "core"."project_schedules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_adicionales_schedule_id" ON "core"."schedule_adicionales" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_imprevistos_schedule_id" ON "core"."schedule_imprevistos" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_payment_rows_schedule_fecha" ON "core"."schedule_payment_rows" USING btree ("schedule_id","fecha");--> statement-breakpoint
CREATE INDEX "idx_schedule_task_events_stable_key" ON "core"."schedule_task_events" USING btree ("task_stable_key");--> statement-breakpoint
CREATE INDEX "idx_schedule_task_events_task_id" ON "core"."schedule_task_events" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_tasks_key_uq" ON "core"."schedule_tasks" USING btree ("schedule_id","stable_key");--> statement-breakpoint
CREATE INDEX "idx_schedule_tasks_schedule_id" ON "core"."schedule_tasks" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_tasks_fin" ON "core"."schedule_tasks" USING btree ("fin");--> statement-breakpoint
CREATE INDEX "idx_schedule_tasks_responsable_contact_id" ON "core"."schedule_tasks" USING btree ("responsable_contact_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_tasks_status_updated_by" ON "core"."schedule_tasks" USING btree ("status_updated_by");