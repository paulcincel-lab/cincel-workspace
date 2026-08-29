CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "idx_activities_project_name_snapshot_trgm" ON "core"."activities" USING gin ("project_name_snapshot" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_activities_manager_name_snapshot_trgm" ON "core"."activities" USING gin ("manager_name_snapshot" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_activities_description_trgm" ON "core"."activities" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_clients_name_trgm" ON "core"."clients" USING gin ("name" gin_trgm_ops);