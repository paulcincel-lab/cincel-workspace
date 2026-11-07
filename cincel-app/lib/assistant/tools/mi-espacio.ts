/**
 * Assistant tool group "Mi espacio y jornada (6): create_note, create_checklist, clock_in, pause_or_clock_out, get_my_hours, team_hours_report" (redesign BE §10.3; Phase 7).
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * and `available(ctx)` reading only the flags modules (Rule 3).
 *
 * Contract stub: registers no tools.
 */
import type { DefinedTool } from "@/lib/assistant/define-tool";

export const tools: DefinedTool[] = [];
