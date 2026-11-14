import type { ShellProject, ShellProjects } from "@/lib/types/shell";

/** The "Filtrar proyectos…" input shows above this many projects. */
export const PROJECTS_FILTER_THRESHOLD = 12;

/** Lowercase without accents, so "diseno" finds "Diseño". */
export function normalizeProjectQuery(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type SidebarProjectGroups = {
  /** Active projects by name. */
  active: ShellProject[];
  /** Pausados y cerrados (paused, completed, cancelled) by name. */
  inactive: ShellProject[];
};

const byName = (a: ShellProject, b: ShellProject) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });

/**
 * The submenu's two lists: active projects first, then "Pausados y cerrados",
 * each sorted by name; `query` keeps the projects whose name contains it.
 */
export function groupSidebarProjects(projects: ShellProjects, query = ""): SidebarProjectGroups {
  const needle = normalizeProjectQuery(query);
  const shown = needle ? projects.filter((p) => normalizeProjectQuery(p.name).includes(needle)) : projects;
  return {
    active: shown.filter((p) => p.status === "activo").sort(byName),
    inactive: shown.filter((p) => p.status !== "activo").sort(byName),
  };
}

/** The filter input appears with more than `PROJECTS_FILTER_THRESHOLD` projects. */
export function showsProjectsFilter(count: number): boolean {
  return count > PROJECTS_FILTER_THRESHOLD;
}

/** The id of the project the route shows (`/proyectos/<id>…`), or null. */
export function activeProjectId(pathname: string | null | undefined): string | null {
  const match = /^\/proyectos\/([^/?#]+)/.exec(pathname ?? "");
  return match ? decodeURIComponent(match[1]!) : null;
}
