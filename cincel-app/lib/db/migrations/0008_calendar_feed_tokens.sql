CREATE TABLE "core"."calendar_feed_tokens" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feed_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "core"."calendar_feed_tokens" ADD CONSTRAINT "calendar_feed_tokens_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;