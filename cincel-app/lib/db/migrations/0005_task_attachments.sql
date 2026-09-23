CREATE TABLE "core"."task_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_attachments_mime_check" CHECK ("core"."task_attachments"."mime_type" like 'image/%' or "core"."task_attachments"."mime_type" = 'text/plain'),
	CONSTRAINT "task_attachments_size_check" CHECK ("core"."task_attachments"."size_bytes" > 0 and "core"."task_attachments"."size_bytes" <= 10485760)
);
--> statement-breakpoint
ALTER TABLE "core"."task_attachments" ADD CONSTRAINT "task_attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "core"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_id_staff_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_attachments_task_id" ON "core"."task_attachments" USING btree ("task_id");