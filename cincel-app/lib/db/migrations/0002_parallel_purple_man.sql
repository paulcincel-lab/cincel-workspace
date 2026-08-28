CREATE TABLE "core"."client_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"field" text NOT NULL,
	"before_value" text DEFAULT '' NOT NULL,
	"after_value" text DEFAULT '' NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "core"."client_history" ADD CONSTRAINT "client_history_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_client_history_client_id" ON "core"."client_history" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_history_event_at" ON "core"."client_history" USING btree ("event_at");