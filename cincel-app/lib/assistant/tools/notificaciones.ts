/**
 * Assistant tool group "Notificaciones y recordatorios (7): list_notifications, mark_notifications_read, create_reminder, list_reminders, cancel_reminder, notify_people, schedule_digest" (redesign BE §10.3; Phase 7).
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * and `available(ctx)` reading only the flags modules (Rule 3).
 *
 * Contract stub: registers no tools.
 */
import type { DefinedTool } from "@/lib/assistant/define-tool";

export const tools: DefinedTool[] = [];
