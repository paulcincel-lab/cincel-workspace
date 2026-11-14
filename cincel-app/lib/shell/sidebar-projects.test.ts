import { describe, expect, it } from "vitest";

import {
  activeProjectId,
  groupSidebarProjects,
  PROJECTS_FILTER_THRESHOLD,
  showsProjectsFilter,
} from "@/lib/shell/sidebar-projects";
import type { ShellProject } from "@/lib/types/shell";

const p = (id: string, name: string, status: ShellProject["status"] = "activo"): ShellProject => ({
  id,
  name,
  status,
  colorVar: "var(--chart-1)",
});

const PROJECTS = [
  p("3", "Zafiro"),
  p("1", "Álamo"),
  p("2", "Diseño Norte"),
  p("4", "Brisa", "pausado"),
  p("5", "Aurora", "completado"),
  p("6", "Cobre", "cancelado"),
];

describe("groupSidebarProjects", () => {
  it("lists active projects by name, then the paused and closed ones by name", () => {
    const { active, inactive } = groupSidebarProjects(PROJECTS);
    expect(active.map((x) => x.name)).toEqual(["Álamo", "Diseño Norte", "Zafiro"]);
    expect(inactive.map((x) => x.name)).toEqual(["Aurora", "Brisa", "Cobre"]);
  });

  it("filters by name ignoring case and accents, in both groups", () => {
    expect(groupSidebarProjects(PROJECTS, "diseno").active.map((x) => x.id)).toEqual(["2"]);
    const result = groupSidebarProjects(PROJECTS, "  AU ");
    expect(result.active).toEqual([]);
    expect(result.inactive.map((x) => x.id)).toEqual(["5"]);
    expect(groupSidebarProjects(PROJECTS, "nada")).toEqual({ active: [], inactive: [] });
  });

  it("only holds what it was given (a project the viewer cannot see never appears)", () => {
    const visible = PROJECTS.filter((x) => x.id !== "3");
    const { active, inactive } = groupSidebarProjects(visible);
    expect([...active, ...inactive].map((x) => x.id)).not.toContain("3");
  });

  it("does not mutate its input", () => {
    const copy = [...PROJECTS];
    groupSidebarProjects(PROJECTS);
    expect(PROJECTS).toEqual(copy);
  });
});

describe("showsProjectsFilter", () => {
  it("appears only above 12 projects", () => {
    expect(PROJECTS_FILTER_THRESHOLD).toBe(12);
    expect(showsProjectsFilter(12)).toBe(false);
    expect(showsProjectsFilter(13)).toBe(true);
  });
});

describe("activeProjectId", () => {
  it("reads the project id of the route", () => {
    expect(activeProjectId("/proyectos/abc")).toBe("abc");
    expect(activeProjectId("/proyectos/abc/tareas")).toBe("abc");
    expect(activeProjectId("/proyectos")).toBeNull();
    expect(activeProjectId("/tareas")).toBeNull();
    expect(activeProjectId(null)).toBeNull();
  });
});
