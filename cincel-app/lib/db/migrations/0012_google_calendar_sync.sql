CREATE TABLE "core"."google_calendar_events" (
	"staff_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"google_event_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_events_staff_id_event_key_pk" PRIMARY KEY("staff_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "core"."google_calendar_syncs" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"calendar_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."google_calendar_events" ADD CONSTRAINT "google_calendar_events_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."google_calendar_syncs" ADD CONSTRAINT "google_calendar_syncs_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;