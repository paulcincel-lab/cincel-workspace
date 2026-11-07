/**
 * Page context for the assistant (redesign FE §3.9): built on the client from
 * the current route and sent with every chat request. Pure and client-safe.
 * The ids are only hints; the chat route and the context chip resolve them
 * through the viewer-scoped reads (BE §8.10).
 */
import type { AssistantContext } from "@/lib/types/redesign";

type SearchParamsLike = { get(name: string): string | null } | null | undefined;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function cleanId(value: string | null | undefined): string | undefined {
  const v = (value ?? "").trim();
  return v && ID_PATTERN.test(v) ? v : undefined;
}

/**
 * `/proyectos/[id]*` → `projectId`; `/tareas?tarea=<id>` → `taskId`;
 * `/personas/equipo/[id]` → `personId`; `route` is always the pathname.
 */
export function assistantContextFromRoute(pathname: string, searchParams?: SearchParamsLike): AssistantContext {
  const route = pathname || "/";
  const context: AssistantContext = { route };
  const segments = route.split("?")[0].split("/").filter(Boolean);

  if (segments[0] === "proyectos" && segments[1]) {
    const projectId = cleanId(decodeURIComponent(segments[1]));
    if (projectId) context.projectId = projectId;
  }
  if (segments[0] === "tareas" && segments.length === 1) {
    const taskId = cleanId(searchParams?.get("tarea"));
    if (taskId) context.taskId = taskId;
  }
  if (segments[0] === "personas" && segments[1] === "equipo" && segments[2]) {
    const personId = cleanId(decodeURIComponent(segments[2]));
    if (personId) context.personId = personId;
  }
  return context;
}

/** True on the full assistant page, where the floating entry point is hidden. */
export function isAssistantPage(pathname: string): boolean {
  return pathname === "/asistente" || pathname.startsWith("/asistente/");
}
