import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { qk, STALE } from "@/lib/query/keys";
import type { ShellBadges, ShellProject, ShellProjects } from "@/lib/types/shell";

/** The private GET route the badge poll reads (decision D5). */
export const SHELL_BADGES_URL = "/api/shell/badges";

/** How often the badges refetch while the tab is visible (plan §4.5). */
export const SHELL_BADGES_REFETCH_MS = 60_000;

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * The route's JSON as `ShellBadges`. A non-2xx answer throws its error code
 * (the query keeps the last counts); unknown or negative counts read as 0.
 */
export async function parseBadges(response: Response): Promise<ShellBadges> {
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) code = body.error;
    } catch {
      // No JSON body: keep the status code.
    }
    throw new Error(code);
  }
  const body = (await response.json()) as Partial<ShellBadges> | null;
  const bandeja = body?.bandeja;
  const dueReminders = Array.isArray(bandeja?.dueReminders)
    ? bandeja.dueReminders.filter((iso): iso is string => typeof iso === "string")
    : [];
  return {
    tareasOpen: count(body?.tareasOpen),
    bandeja: {
      unreadCount: count(bandeja?.unreadCount),
      dueReminders,
      ...(typeof bandeja?.renderedAt === "number" ? { renderedAt: bandeja.renderedAt } : {}),
    },
  };
}

/**
 * `qk.shell.badges()`: my open tasks and the Bandeja counters. Prefetched by
 * the `(staff)` layout (`loadShellBadges`), then polled every 60 s through
 * `GET /api/shell/badges`, only while the tab is visible. Side-effect free.
 */
export const shellBadgesOptions = () =>
  queryOptions<ShellBadges>({
    queryKey: qk.shell.badges(),
    queryFn: () => fetch(SHELL_BADGES_URL, { cache: "no-store", credentials: "same-origin" }).then(parseBadges),
    staleTime: STALE.shellBadges,
    refetchInterval: SHELL_BADGES_REFETCH_MS,
    refetchIntervalInBackground: false,
  });

/**
 * Writes a fresh Bandeja unread count into `shell.badges` (the Bandeja's own
 * reads and mark-read know it first), so the Mi espacio badge follows at once.
 */
export function setShellBadgesUnread(qc: QueryClient, unreadCount: number): void {
  qc.setQueryData<ShellBadges>(qk.shell.badges(), (current) =>
    current ? { ...current, bandeja: { ...current.bandeja, unreadCount: Math.max(0, Math.floor(unreadCount)) } } : current,
  );
}

/** The private GET route the sidebar "Proyectos" submenu reads. */
export const SHELL_PROJECTS_URL = "/api/shell/projects";

const PROJECT_STATUSES: readonly ShellProject["status"][] = ["activo", "pausado", "completado", "cancelado"];

/** The route's JSON as `ShellProjects`; rows without an id or a name are dropped. */
export async function parseShellProjects(response: Response): Promise<ShellProjects> {
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) code = body.error;
    } catch {
      // No JSON body: keep the status code.
    }
    throw new Error(code);
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) return [];
  const rows: ShellProjects = [];
  for (const raw of body as Partial<ShellProject>[]) {
    if (typeof raw?.id !== "string" || !raw.id || typeof raw.name !== "string" || !raw.name) continue;
    rows.push({
      id: raw.id,
      name: raw.name,
      status: PROJECT_STATUSES.includes(raw.status as ShellProject["status"]) ? (raw.status as ShellProject["status"]) : "activo",
      colorVar: typeof raw.colorVar === "string" && raw.colorVar ? raw.colorVar : "var(--muted-foreground)",
    });
  }
  return rows;
}

/**
 * `qk.shell.projects()`: the projects the sidebar lists. Prefetched by the
 * `(staff)` layout with the badges and invalidated by every project write
 * (create, rename, archive, delete, restore). Side-effect free.
 */
export const shellProjectsOptions = () =>
  queryOptions<ShellProjects>({
    queryKey: qk.shell.projects(),
    queryFn: () => fetch(SHELL_PROJECTS_URL, { cache: "no-store", credentials: "same-origin" }).then(parseShellProjects),
    staleTime: STALE.shellProjects,
  });
