ALTER TABLE "core"."resource_links" ADD COLUMN "owner_member_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD COLUMN "personal_for_member_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD CONSTRAINT "resource_links_owner_member_id_team_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "core"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD CONSTRAINT "resource_links_personal_for_member_id_team_members_id_fk" FOREIGN KEY ("personal_for_member_id") REFERENCES "core"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_resource_links_owner_member_id" ON "core"."resource_links" USING btree ("owner_member_id");--> statement-breakpoint
CREATE INDEX "idx_resource_links_personal_for_member_id" ON "core"."resource_links" USING btree ("personal_for_member_id");--> statement-breakpoint
UPDATE "core"."resource_links" rl SET "owner_member_id" = tm."id"
  FROM "core"."team_members" tm
  WHERE tm."legacy_id" = rl."owner_team_member_legacy_id" AND rl."owner_member_id" IS NULL;--> statement-breakpoint
UPDATE "core"."resource_links" rl SET "personal_for_member_id" = tm."id"
  FROM "core"."team_members" tm
  WHERE tm."legacy_id" = rl."personal_for_team_member_legacy_id" AND rl."personal_for_member_id" IS NULL;
