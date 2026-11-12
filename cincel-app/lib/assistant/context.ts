/**
 * Page context of the chat route (redesign BE §8.10): the ids in
 * `AssistantContext` come from the client, so each one is resolved through
 * the viewer-scoped reads (`fetchProjectAction`, `fetchTaskAction`,
 * `fetchStaffDetailAction`) and dropped when the viewer can't see it. Only
 * resolved ids reach the thread, the tools and the system prompt.
 */
import { getMeetingDetail } from "@/lib/actions/page-data/calendario-actions";
import { fetchProjectAction } from "@/lib/actions/projects-actions";
import { fetchStaffDetailAction } from "@/lib/actions/staff-actions";
import { fetchTaskAction } from "@/lib/actions/tasks-actions";
import type { AssistantCalendarContext } from "@/lib/types/calendario";
import type { AssistantContext } from "@/lib/types/redesign";
import { AssistantCalendarContextSchema } from "@/lib/validation/calendario";

export type ResolvedAssistantContext = {
  /** The context with only the ids the viewer can see. */
  context: AssistantContext;
  project: { id: string; name: string } | null;
  task: { id: string; title: string; projectId: string; projectName: string } | null;
  person: { id: string; name: string } | null;
  /** The Calendario page context: validated, with the selected item resolved to its label when the viewer can see it. */
  calendar?: { context: AssistantCalendarContext; selectedItem: { id: string; label: string } | null } | null;
  /** Project the `project` input of tools defaults to: the page's project, else the task's. */
  defaultProject: { id: string; name: string } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE_MAX = 300;

function candidateId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value.trim()) ? value.trim().toLowerCase() : null;
}

/** A read that fails (bad id, no access, DB error) counts as not visible. */
async function visible<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return (await read()) ?? null;
  } catch {
    return null;
  }
}

/** Only a same-origin path is kept as `route`. */
function safeRoute(value: unknown): string {
  if (typeof value !== "string") return "";
  const route = value.trim().slice(0, ROUTE_MAX);
  return route.startsWith("/") && !route.startsWith("//") ? route : "";
}

/** `t:<uuid>` / `e:<uuid>` → `{ id, label }`, or null when it doesn't exist or the viewer can't see it. */
async function resolveSelectedItem(itemId: string): Promise<{ id: string; label: string } | null> {
  const id = itemId.slice(2).toLowerCase();
  if (!UUID.test(id)) return null;
  if (itemId.startsWith("t:")) {
    const task = await visible(() => fetchTaskAction(id));
    return task ? { id: itemId, label: task.title } : null;
  }
  const meeting = await visible(() => getMeetingDetail(id));
  return meeting ? { id: itemId, label: meeting.item.title } : null;
}

async function resolveCalendar(raw: unknown): Promise<ResolvedAssistantContext["calendar"]> {
  const parsed = AssistantCalendarContextSchema.safeParse(raw);
  if (!parsed.success || parsed.data.to < parsed.data.from) return null;
  const selectedItem = parsed.data.selectedItemId ? await resolveSelectedItem(parsed.data.selectedItemId) : null;
  const { selectedItemId: _dropped, ...rest } = parsed.data;
  const context: AssistantCalendarContext = { ...rest, ...(selectedItem ? { selectedItemId: selectedItem.id } : {}) };
  return { context, selectedItem };
}

export async function resolveAssistantContext(raw: Partial<AssistantContext> | null | undefined): Promise<ResolvedAssistantContext> {
  const projectId = candidateId(raw?.projectId);
  const taskId = candidateId(raw?.taskId);
  const personId = candidateId(raw?.personId);

  const [calendar, projectRow, taskRow, personRow] = await Promise.all([
    raw?.calendar ? resolveCalendar(raw.calendar) : Promise.resolve(null),
    projectId ? visible(() => fetchProjectAction(projectId)) : Promise.resolve(null),
    taskId ? visible(() => fetchTaskAction(taskId)) : Promise.resolve(null),
    personId ? visible(() => fetchStaffDetailAction(personId)) : Promise.resolve(null),
  ]);

  const project = projectRow ? { id: projectRow.id, name: projectRow.name } : null;
  const task = taskRow
    ? { id: taskRow.id, title: taskRow.title, projectId: taskRow.project.id, projectName: taskRow.project.name }
    : null;
  const person = personRow
    ? { id: personRow.id, name: [personRow.name, personRow.lastName].filter(Boolean).join(" ").trim() || personRow.name }
    : null;

  const context: AssistantContext = { route: safeRoute(raw?.route) };
  if (project) context.projectId = project.id;
  if (task) context.taskId = task.id;
  if (person) context.personId = person.id;
  if (calendar) context.calendar = calendar.context;

  const defaultProject = project ?? (task ? { id: task.projectId, name: task.projectName } : null);
  return { context, project, task, person, calendar, defaultProject };
}
