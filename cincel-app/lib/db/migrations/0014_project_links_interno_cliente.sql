-- Project links become a list split into Interno / Cliente, like task_links (#450).
-- The old fixed slots (administrativo, planos, renders, reportes) become the
-- link's name, and those links are internal.
ALTER TABLE "core"."project_links" DROP CONSTRAINT "project_links_project_kind_uq";--> statement-breakpoint
UPDATE "core"."project_links" SET
  "title" = CASE "kind"
      WHEN 'administrativo' THEN 'Administrativo'
      WHEN 'planos' THEN 'Planos'
      WHEN 'renders' THEN 'Renders'
      WHEN 'reportes' THEN 'Reportes'
      ELSE initcap("kind")
    END || COALESCE(' — ' || NULLIF("title", ''), ''),
  "kind" = 'interno'
WHERE "kind" NOT IN ('interno', 'cliente');--> statement-breakpoint
UPDATE "core"."project_links" SET "title" = "url" WHERE "title" IS NULL OR "title" = '';--> statement-breakpoint
ALTER TABLE "core"."project_links" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_project_links_project_id" ON "core"."project_links" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "core"."project_links" ADD CONSTRAINT "project_links_kind_check" CHECK ("core"."project_links"."kind" in ('interno', 'cliente'));
