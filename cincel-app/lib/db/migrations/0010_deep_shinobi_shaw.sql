ALTER TABLE "core"."activities" DROP CONSTRAINT "activities_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "core"."activities" a SET "project_id" = p."id"
  FROM "core"."projects" p
  WHERE p."name" = a."project_name_snapshot"
    AND p."deleted_at" IS NULL
    AND a."project_id" IS NULL
    AND a."project_name_snapshot" IS NOT NULL
    AND (SELECT count(*) FROM "core"."projects" p2
         WHERE p2."name" = a."project_name_snapshot" AND p2."deleted_at" IS NULL) = 1;
