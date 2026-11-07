/**
 * Assistant tool group "Herramientas de arquitectura (8): measure_areas_from_plan, quantity_takeoff, parametric_cost_estimate, zoning_check, site_photo_log, schedule_from_template, moodboard_from_references, progress_report" (redesign BE §10.3; Phase 7).
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * and `available(ctx)` reading only the flags modules (Rule 3).
 *
 * Contract stub: registers no tools.
 */
import type { DefinedTool } from "@/lib/assistant/define-tool";

export const tools: DefinedTool[] = [];
