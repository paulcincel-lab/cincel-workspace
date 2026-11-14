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
const TASKS: readonly QueryKey[] = [qk.tareas.all, qk.inicio(), qk.shell.badges(), qk.me.tasks()];
/** The Calendario page: every range, summary, load, meeting and proposal (Calendario BE §11). */
const CALENDARIO: readonly QueryKey[] = [qk.calendario.all];
const PROPOSALS: readonly QueryKey[] = [qk.calendario.proposals()];
/** Calendar events show in Inicio's agenda. */
const EVENTS: readonly QueryKey[] = [qk.inicio()];
const EMAIL: readonly QueryKey[] = [qk.me.gmail.all];
const PROJECTS: readonly QueryKey[] = [qk.proyectos.all];
/** Mis solicitudes and the Mejoras list and counts. */
const SOPORTE: readonly QueryKey[] = [qk.soporte.all, qk.mejoras.all];
/** Every `me.notifications(f)` list, the per-kind summary and the bell badge. */
const NOTIFICATIONS: readonly QueryKey[] = [
  qk.me.notifications({}).slice(0, 2),
  qk.me.notificationsSummary(),
  qk.shell.badges(),
];
const NOTIFICATION_PREFS: readonly QueryKey[] = [qk.me.notificationPrefs(), qk.me.preferences()];
/** The Personas contact lists and every contact's detail and history. */
const CONTACTS: readonly QueryKey[] = [qk.personas.contacts("clientes", null).slice(0, 2), ["contacts"]];
/** What a project delete changes (same as `projectDeleteInvalidations`, #1050). */
const PROJECT_DELETE: readonly QueryKey[] = [qk.catalog.projectOptions(), qk.me.today()];

/** The write tools and the families of keys each one makes stale. */
export const TOOL_INVALIDATIONS: Readonly<Record<string, readonly (readonly QueryKey[])[]>> = {
  // Mi espacio
  create_note: [NOTES],
  create_checklist: [CHECKLISTS],
  create_reminder: [REMINDERS],
  mark_notifications_read: [NOTIFICATIONS],
  schedule_digest: [NOTIFICATION_PREFS],
  cancel_reminder: [REMINDERS],
  clock_in: [CLOCK],
  pause_or_clock_out: [CLOCK],
  // Tasks
  create_task: [TASKS, CALENDARIO],
  assign_task: [TASKS, CALENDARIO],
  merge_duplicate_activities: [TASKS],
  update_task_status: [TASKS],
  reschedule_task: [TASKS, CALENDARIO],
  add_task_comment: [TASKS],
  add_subtask: [TASKS],
  create_tasks_from_notes: [TASKS],
  rebalance_workload: [TASKS],
  meeting_to_tasks: [TASKS],
  schedule_site_visit: [TASKS, EVENTS, CALENDARIO],
  schedule_from_template: [TASKS],
  // Calendario y planeación (BE §11.3): the proposing tools (move_tasks, create_event, update_event, cancel_event, ...) write nothing, so they have no entry.
  apply_proposal: [CALENDARIO, PROPOSALS, TASKS, EVENTS],
  undo_proposal: [CALENDARIO, PROPOSALS, TASKS, EVENTS],
  create_tasks_from_minutes: [CALENDARIO, PROPOSALS, TASKS, EVENTS, PROJECTS],
  send_minutes: [CALENDARIO],
  // Email
  draft_email: [EMAIL],
  send_email: [EMAIL],
  link_email_to_project: [EMAIL, PROJECTS],
  request_quotes: [EMAIL, CONTACTS],
  // Projects and the client portal
  create_client: [CONTACTS],
  create_ticket: [SOPORTE],
  create_rfc: [SOPORTE],
  onboard_client: [PROJECTS, TASKS, CONTACTS, PROJECT_DELETE],
  discard_project: [PROJECTS, TASKS, PROJECT_DELETE],
  merge_duplicate_clients: [PROJECTS, CONTACTS],
  site_photo_log: [PROJECTS],
  invite_client_to_portal: [PROJECTS],
  request_client_approval: [PROJECTS],
};

/**
 * Write tools that change nothing the open page caches: their effect is
 * outside Cincel's screens (GitHub, other people's inboxes, Cutto). Every
 * write tool is in `TOOL_INVALIDATIONS` or here (guard test, #1055).
 */
export const WRITES_WITHOUT_LOCAL_CACHE: Readonly<Record<string, string>> = {
  notify_people: "Escribe en la bandeja de otras personas.",
  send_agenda: "Solo envía correo.",
  create_meeting: "Cutto.",
  start_call: "Cutto.",
  invite_to_meeting: "Cutto.",
  send_message: "Cutto.",
  post_to_project_channel: "Cutto.",
  reply_in_thread: "Cutto.",
  create_project_channel: "Cutto.",
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
