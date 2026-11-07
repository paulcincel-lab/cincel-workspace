/**
 * Assistant tool group "Widgets de respuesta (2 model tools): render_table, render_timeline (render_confirmation is the client visual of approvals)" (redesign BE §10.3; Phase 7).
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * and `available(ctx)` reading only the flags modules (Rule 3).
 *
 * Contract stub: registers no tools.
 */
import type { DefinedTool } from "@/lib/assistant/define-tool";

export const tools: DefinedTool[] = [];
