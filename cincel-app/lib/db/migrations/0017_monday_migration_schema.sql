CREATE TYPE "core"."drive_folder_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "core"."dependency_kind" AS ENUM('finish_to_start');--> statement-breakpoint
CREATE TYPE "core"."import_batch_status" AS ENUM('applying', 'applied', 'rolled_back');--> statement-breakpoint
CREATE TABLE "core"."task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"kind" "core"."dependency_kind" DEFAULT 'finish_to_start' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_not_self" CHECK ("core"."task_dependencies"."task_id" <> "core"."task_dependencies"."depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "core"."import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'monday' NOT NULL,
	"account_id" text NOT NULL,
	"account_slug" text,
	"account_name" text,
	"exported_by_email" text,
	"exported_at" timestamp with time zone NOT NULL,
	"export_path" text NOT NULL,
	"api_version" text DEFAULT '2026-07' NOT NULL,
	"mapping" jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "core"."import_batch_status" DEFAULT 'applying' NOT NULL,
	"applied_by_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rolled_back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."import_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"asset_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"group_name" text,
	"file_name" text NOT NULL,
	"size_bytes" bigint,
	"sha256" text NOT NULL,
	"local_path" text NOT NULL,
	"drive_file_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."import_refs" (
	"source" text NOT NULL,
	"entity" text NOT NULL,
	"external_id" text NOT NULL,
	"row_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"data" jsonb,
	"row_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_refs_source_entity_external_id_pk" PRIMARY KEY("source","entity","external_id")
);
--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "drive_internal_folder_id" text;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "drive_client_folder_id" text;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "drive_inbound_folder_id" text;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "drive_import_folder_id" text;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "drive_folder_status" "core"."drive_folder_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "drive_folder_error" text;--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD COLUMN "parent_task_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "core"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "core"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_batches" ADD CONSTRAINT "import_batches_applied_by_id_staff_id_fk" FOREIGN KEY ("applied_by_id") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_files" ADD CONSTRAINT "import_files_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "core"."import_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_files" ADD CONSTRAINT "import_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_files" ADD CONSTRAINT "import_files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "core"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."import_refs" ADD CONSTRAINT "import_refs_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "core"."import_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_dependencies_pair_uq" ON "core"."task_dependencies" USING btree ("task_id","depends_on_task_id");--> statement-breakpoint
CREATE INDEX "idx_task_dependencies_depends_on" ON "core"."task_dependencies" USING btree ("depends_on_task_id");--> statement-breakpoint
CREATE INDEX "idx_import_batches_account_status" ON "core"."import_batches" USING btree ("account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "import_files_batch_asset_uq" ON "core"."import_files" USING btree ("batch_id","asset_id");--> statement-breakpoint
CREATE INDEX "idx_import_refs_row" ON "core"."import_refs" USING btree ("entity","row_id");--> statement-breakpoint
CREATE INDEX "idx_import_refs_batch" ON "core"."import_refs" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "core"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tasks_parent_task_id" ON "core"."tasks" USING btree ("parent_task_id");