ALTER TABLE "core"."activity_support_members" DROP CONSTRAINT "activity_support_members_activity_id_team_member_id_support_name_snapshot_unique";--> statement-breakpoint
ALTER TABLE "core"."activities" DROP CONSTRAINT "activities_manager_member_id_team_members_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."activity_history" DROP CONSTRAINT "activity_history_author_member_id_team_members_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."activity_support_members" DROP CONSTRAINT "activity_support_members_team_member_id_team_members_id_fk";
--> statement-breakpoint
DROP INDEX "core"."idx_activities_manager_member_id";--> statement-breakpoint
ALTER TABLE "core"."activities" DROP COLUMN "manager_member_id";--> statement-breakpoint
ALTER TABLE "core"."activity_history" DROP COLUMN "author_member_id";--> statement-breakpoint
ALTER TABLE "core"."activity_support_members" DROP COLUMN "team_member_id";--> statement-breakpoint
ALTER TABLE "core"."activity_support_members" ADD CONSTRAINT "activity_support_members_activity_id_support_name_snapshot_unique" UNIQUE("activity_id","support_name_snapshot");