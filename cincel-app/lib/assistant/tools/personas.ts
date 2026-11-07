/**
 * Assistant tool group "Personas, clientes y proveedores (5): get_person, invite_client_to_portal, request_client_approval, request_quotes, compare_quotes" (redesign BE §10.3; Phase 7).
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * and `available(ctx)` reading only the flags modules (Rule 3).
 *
 * Contract stub: registers no tools.
 */
import type { DefinedTool } from "@/lib/assistant/define-tool";

export const tools: DefinedTool[] = [];
