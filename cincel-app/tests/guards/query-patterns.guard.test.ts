// @vitest-environment node
/**
 * The #1051 audit's data rules, over components/ and lib/ (plan §5.0):
 * - no Zustand store hook without a selector (whole-store re-renders);
 * - no `queryFn` that filters a full `*Action` list on the client;
 * - no sort over `useInfiniteQuery` pages (the server sorts; "Cargar más"
 *   must append, never reorder). A sort that keeps the server's order is
 *   marked `// data-patterns: server-order`.
 * - no full task read in the Proyecto · Resumen (its numbers come from
 *   `qk.proyectos.resumenSummary(id)`).
 * Plus: every task list pages through `tareasListInfiniteOptions` (or the
 * Mi espacio closed-task pages) instead of a full-list read.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { checkSource } from "../../scripts/check-data-patterns.mjs";

const ROOT = join(__dirname, "../..");
const RULES = [/ without a selector$/, /^queryFn → /, / over paged rows$/, /^Resumen full task read → /];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === "__snapshots__" || name === "fixtures" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function offenders(): string[] {
  const found: string[] = [];
  for (const dir of ["components", "lib", "app"]) {
    for (const file of sources(join(ROOT, dir))) {
      const hits = (checkSource(file, readFileSync(file, "utf8")) as { line: number; pattern: string }[]).filter((v) =>
        RULES.some((rule) => rule.test(v.pattern)),
      );
      for (const v of hits) found.push(`${relative(ROOT, file)}:${v.line} ${v.pattern}`);
    }
  }
  return found;
}

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("query patterns (#1051)", () => {
  it("no whole-store subscriptions, client-filtered full lists or sorts over paged rows", () => {
    expect(offenders()).toEqual([]);
  });

  it("the converted task lists page instead of reading every task", () => {
    // The project Tareas tab: summary counts plus `qk.tareas.list` pages, not the full tab read.
    const tab = read("components/proyectos/ProjectTasksByFase.tsx");
    expect(tab).toMatch(/tareasListInfiniteOptions\(/);
    expect(tab).not.toMatch(/proyectoTareasOptions\(/);
    // Mi espacio's closed tasks page on the server; no `fetchMyTasksAction` full read.
    expect(read("lib/query/options/mi-espacio.ts")).not.toMatch(/fetchMyTasksAction/);
    // Proyectos · Analítico rows: server order, one request for "Expandir todo".
    const rows = read("components/widgets/ProjectAnaliticoTasks.tsx");
    expect(rows).toMatch(/tareasListInfiniteOptions\(/);
    expect(rows).not.toMatch(/sortByDueDate/);
    expect(read("components/widgets/ProjectsAnaliticoLayout.tsx")).toMatch(/prefetchTareasListFirstPages\(/);
    // Resumen: server task numbers, and "Tareas por tramo" pages per group.
    for (const file of ["components/widgets/ResumenVisualLayout.tsx", "components/proyectos/ProjectSummary.tsx", "components/widgets/ResumenEsencialLayout.tsx"]) {
      expect(read(file)).not.toMatch(/proyectoTareasOptions|tramoProgress\(tasks|nextTasks\(/);
    }
    const resumen = read("components/widgets/ResumenAnaliticoLayout.tsx");
    expect(resumen).toMatch(/proyectoResumenSummaryOptions\(/);
    expect(resumen).toMatch(/tareasListInfiniteOptions\(/);
    expect(read("app/(staff)/proyectos/[id]/page.tsx")).toMatch(/proyectoResumenSummaryOptions\(/);
  });
});
