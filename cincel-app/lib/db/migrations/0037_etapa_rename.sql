-- Renames only (no data change): tramo_start_batches -> etapa_start_batches with its constraints and indexes.
ALTER TABLE "core"."tramo_start_batches" RENAME TO "etapa_start_batches";
--> statement-breakpoint
ALTER TABLE "core"."etapa_start_batches" RENAME CONSTRAINT "tramo_start_batches_pkey" TO "etapa_start_batches_pkey";
--> statement-breakpoint
ALTER TABLE "core"."etapa_start_batches" RENAME CONSTRAINT "tramo_start_batches_trigger_check" TO "etapa_start_batches_trigger_check";
--> statement-breakpoint
ALTER TABLE "core"."etapa_start_batches" RENAME CONSTRAINT "tramo_start_batches_mode_check" TO "etapa_start_batches_mode_check";
--> statement-breakpoint
ALTER TABLE "core"."etapa_start_batches" RENAME CONSTRAINT "tramo_start_batches_project_id_projects_id_fk" TO "etapa_start_batches_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."etapa_start_batches" RENAME CONSTRAINT "tramo_start_batches_workflow_id_workflows_id_fk" TO "etapa_start_batches_workflow_id_workflows_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."etapa_start_batches" RENAME CONSTRAINT "tramo_start_batches_started_by_id_staff_id_fk" TO "etapa_start_batches_started_by_id_staff_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."etapa_start_batches" RENAME CONSTRAINT "tramo_start_batches_previous_current_workflow_id_workflows_id_fk" TO "etapa_start_batches_previous_current_workflow_id_workflows_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."etapa_start_batches" RENAME CONSTRAINT "tramo_start_batches_undone_by_id_staff_id_fk" TO "etapa_start_batches_undone_by_id_staff_id_fk";
--> statement-breakpoint
ALTER TABLE "core"."tasks" RENAME CONSTRAINT "tasks_start_batch_id_tramo_start_batches_id_fk" TO "tasks_start_batch_id_etapa_start_batches_id_fk";
--> statement-breakpoint
ALTER INDEX "core"."idx_tramo_start_batches_project_workflow" RENAME TO "idx_etapa_start_batches_project_workflow";
--> statement-breakpoint
ALTER INDEX "core"."idx_tramo_start_batches_workflow_id" RENAME TO "idx_etapa_start_batches_workflow_id";
--> statement-breakpoint
ALTER INDEX "core"."idx_tramo_start_batches_started_by_id" RENAME TO "idx_etapa_start_batches_started_by_id";
--> statement-breakpoint
ALTER INDEX "core"."idx_tramo_start_batches_undone_by_id" RENAME TO "idx_etapa_start_batches_undone_by_id";
--> statement-breakpoint
ALTER INDEX "core"."idx_tramo_start_batches_previous_current" RENAME TO "idx_etapa_start_batches_previous_current";
