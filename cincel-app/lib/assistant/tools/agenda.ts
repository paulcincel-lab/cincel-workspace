/**
 * Assistant tool group "Agenda y calendario (6): list_events, find_free_slots; create_event, update_event, cancel_event, schedule_site_visit registered disabled" (redesign BE §10.3; Phase 7).
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * and `available(ctx)` reading only the flags modules (Rule 3).
 *
 * Contract stub: registers no tools.
 */
import type { DefinedTool } from "@/lib/assistant/define-tool";

export const tools: DefinedTool[] = [];
