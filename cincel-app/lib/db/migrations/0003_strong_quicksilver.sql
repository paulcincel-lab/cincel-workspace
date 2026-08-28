ALTER TABLE "core"."resource_links" ADD COLUMN "google_file_id" text;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD COLUMN "icon_link" text;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD COLUMN "thumbnail_link" text;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD COLUMN "web_view_link" text;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD COLUMN "synced_at" timestamp with time zone;