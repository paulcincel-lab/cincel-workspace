CREATE TABLE "core"."support_ticket_attachment_blobs" (
	"attachment_id" uuid PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	CONSTRAINT "support_ticket_attachment_blobs_size_check" CHECK (octet_length("core"."support_ticket_attachment_blobs"."bytes") <= 5242880)
);
--> statement-breakpoint
ALTER TABLE "core"."support_ticket_attachment_blobs" ADD CONSTRAINT "support_ticket_attachment_blobs_attachment_id_support_ticket_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "core"."support_ticket_attachments"("id") ON DELETE cascade ON UPDATE no action;