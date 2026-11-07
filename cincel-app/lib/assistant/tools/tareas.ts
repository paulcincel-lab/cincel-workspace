/**
 * Assistant tool group "Tareas (6): update_task_status, reschedule_task, add_task_comment, add_checklist_item, create_tasks_from_notes, rebalance_workload" (redesign BE §10.3; Phase 7).
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * and `available(ctx)` reading only the flags modules (Rule 3).
 *
 * Contract stub: registers no tools.
 */
import type { DefinedTool } from "@/lib/assistant/define-tool";

export const tools: DefinedTool[] = [];
