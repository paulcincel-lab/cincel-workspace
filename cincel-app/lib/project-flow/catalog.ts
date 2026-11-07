/**
 * Fixed project flow rules (BE §5, §7.1). The seed catalog itself
 * (`DEFAULT_CATALOG`, `DEFAULT_POSITIONS`) lives in scripts/default-catalog.mjs.
 */

/** A readiness rule: tramo `key` is ready once fase `phaseKey` of tramo `after` is done. */
export type ReadinessRule = { after: string; phaseKey: string };

/**
 * Readiness, fixed in code and shown read-only (RD-4): Diseño after
 * Presale·Cobro, Construcción after Diseño·Ejecutivo. Keyed by
 * `workflows.key`, resolved through `workflow_phases.key`, so renaming a fase
 * doesn't break it. A tramo with no rule (the first one) has `readiness: null`.
 */
export const READINESS: Readonly<Record<string, ReadinessRule>> = {
  diseno: { after: "presale", phaseKey: "cobro" },
  construccion: { after: "diseno", phaseKey: "ejecutivo" },
};

/** `tasks.system_key` of the admin task "Asignar cliente y origen". */
export const ASSIGN_CLIENT_SYSTEM_KEY = "assign_client";
export const ASSIGN_CLIENT_TASK_TITLE = "Asignar cliente y origen";

/** Time zone of "today" for system-made task dates (same as TASK_TREND_TIME_ZONE). */
export const FLOW_TIME_ZONE = "America/Mexico_City";

/** What started a tramo (`tramo_start_batches.trigger`). */
export type TramoStartTrigger = "manual" | "on_create" | "on_ready";
export const TRAMO_START_TRIGGERS: readonly TramoStartTrigger[] = ["manual", "on_create", "on_ready"];

/** `tramo_start_batches.assignment_mode`. */
export type TramoAssignmentMode = "self" | "by_phase" | "none";

/** Project history fields (`history_events.field`) written by a start and its undo. */
export const TRAMO_STARTED_FIELD = "tramo_started";
export const TRAMO_START_UNDONE_FIELD = "tramo_start_undone";

/** `project_flow_migration_report.kind` values (BE §4.4). */
export const PROJECT_FLOW_REPORT_KINDS = [
  "task_phase_unmatched",
  "task_tramo_inferred",
  "task_linked_to_template",
  "status_reused",
  "status_created",
  "template_phase_defaulted",
  "project_phases",
  "project_without_tramo",
  "project_renamed_duplicate",
  "area",
  "area_member",
  "area_workflow",
  "group_mapping_area_removed",
] as const;
export type ProjectFlowReportKind = (typeof PROJECT_FLOW_REPORT_KINDS)[number];

/** app_settings key of the firm-wide monday status map (RD-5). */
export const MONDAY_STATUS_MAP_SETTING = "monday.status_map";
