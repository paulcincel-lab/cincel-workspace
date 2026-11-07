/**
 * Page context of the chat route (redesign BE §8.10): the ids in
 * `AssistantContext` come from the client, so each one is resolved through
 * the viewer-scoped reads (`fetchProjectAction`, `fetchTaskAction`,
 * `fetchStaffDetailAction`) and dropped when the viewer can't see it. Only
 * resolved ids reach the thread, the tools and the system prompt.
 */
import { fetchProjectAction } from "@/lib/actions/projects-actions";
import { fetchStaffDetailAction } from "@/lib/actions/staff-actions";
import { fetchTaskAction } from "@/lib/actions/tasks-actions";
import type { AssistantContext } from "@/lib/types/redesign";

export type ResolvedAssistantContext = {
  /** The context with only the ids the viewer can see. */
  context: AssistantContext;
  project: { id: string; name: string } | null;
  task: { id: string; title: string; projectId: string; projectName: string } | null;
  person: { id: string; name: string } | null;
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

export async function resolveAssistantContext(raw: Partial<AssistantContext> | null | undefined): Promise<ResolvedAssistantContext> {
  const projectId = candidateId(raw?.projectId);
  const taskId = candidateId(raw?.taskId);
  const personId = candidateId(raw?.personId);

  const [projectRow, taskRow, personRow] = await Promise.all([
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

  const defaultProject = project ?? (task ? { id: task.projectId, name: task.projectName } : null);
  return { context, project, task, person, defaultProject };
}
