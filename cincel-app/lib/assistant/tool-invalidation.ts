/**
 * Tool part → query keys (Query Migration Phase 10, #944, plan §4.4
 * Assistant). The chat route runs the write tools, and a revalidation from a
 * route handler can't refresh the open page, so when a turn finishes the
 * client invalidates the keys implied by the tool parts of the final
 * assistant message. Only finished, successful tool calls count; read-only
 * tools invalidate nothing. Pure and client-safe.
 */
import type { QueryKey } from "@tanstack/react-query";
import type { UIMessage } from "ai";

import { qk } from "@/lib/query/keys";

/** Every `me.reminders(range)` list. */
const ME_REMINDERS_PREFIX: QueryKey = qk.me.reminders("today-tomorrow").slice(0, 2);

const NOTES: readonly QueryKey[] = [qk.me.notes()];
const CHECKLISTS: readonly QueryKey[] = [qk.me.checklists()];
const REMINDERS: readonly QueryKey[] = [ME_REMINDERS_PREFIX, qk.shell.badges(), qk.inicio()];
const CLOCK: readonly QueryKey[] = [qk.me.today()];
const TASKS: readonly QueryKey[] = [qk.tareas.all, qk.inicio(), qk.shell.badges()];
/** Calendar events show in Inicio's agenda. */
const EVENTS: readonly QueryKey[] = [qk.inicio()];
const EMAIL: readonly QueryKey[] = [qk.me.gmail.all];
const PROJECTS: readonly QueryKey[] = [qk.proyectos.all];

/** The write tools and the families of keys each one makes stale. */
export const TOOL_INVALIDATIONS: Readonly<Record<string, readonly (readonly QueryKey[])[]>> = {
  // Mi espacio
  create_note: [NOTES],
  create_checklist: [CHECKLISTS],
  create_reminder: [REMINDERS],
  cancel_reminder: [REMINDERS],
  clock_in: [CLOCK],
  pause_or_clock_out: [CLOCK],
  // Tasks
  create_task: [TASKS],
  assign_task: [TASKS],
  merge_duplicate_activities: [TASKS],
  update_task_status: [TASKS],
  reschedule_task: [TASKS],
  add_task_comment: [TASKS],
  add_checklist_item: [TASKS],
  create_tasks_from_notes: [TASKS],
  rebalance_workload: [TASKS],
  meeting_to_tasks: [TASKS],
  schedule_site_visit: [TASKS, EVENTS],
  schedule_from_template: [TASKS],
  // Calendar events
  create_event: [EVENTS],
  update_event: [EVENTS],
  cancel_event: [EVENTS],
  // Email
  draft_email: [EMAIL],
  send_email: [EMAIL],
  link_email_to_project: [EMAIL, PROJECTS],
  // Projects and the client portal
  create_client: [PROJECTS],
  onboard_client: [PROJECTS, TASKS],
  discard_project: [PROJECTS, TASKS],
  merge_duplicate_clients: [PROJECTS],
  invite_client_to_portal: [PROJECTS],
  request_client_approval: [PROJECTS],
};

type ToolPartLike = { type: string; toolName?: string; state?: string; output?: unknown };

function toolNameOf(part: ToolPartLike): string | null {
  if (part.type === "dynamic-tool") return typeof part.toolName === "string" ? part.toolName : null;
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}

/** A tool result that reports a failure instead of throwing (`{ ok: false }`). */
function isFailedOutput(output: unknown): boolean {
  return typeof output === "object" && output !== null && (output as { ok?: unknown }).ok === false;
}

/**
 * The query keys to invalidate for a finished turn's tool parts: deduplicated,
 * in first-seen order. Parts still running, denied, errored or reporting
 * `{ ok: false }` are skipped.
 */
export function keysForToolParts(parts: UIMessage["parts"] | undefined): QueryKey[] {
  const seen = new Set<string>();
  const keys: QueryKey[] = [];
  for (const raw of parts ?? []) {
    const part = raw as ToolPartLike;
    if (typeof part?.type !== "string") continue;
    const name = toolNameOf(part);
    if (!name || part.state !== "output-available" || isFailedOutput(part.output)) continue;
    for (const family of TOOL_INVALIDATIONS[name] ?? []) {
      for (const key of family) {
        const id = JSON.stringify(key);
        if (seen.has(id)) continue;
        seen.add(id);
        keys.push(key);
      }
    }
  }
  return keys;
}
