CREATE TABLE "core"."google_oauth_accounts" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."google_oauth_accounts" ADD CONSTRAINT "google_oauth_accounts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;