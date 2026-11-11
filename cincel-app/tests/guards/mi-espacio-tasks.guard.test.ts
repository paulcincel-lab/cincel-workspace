// @vitest-environment node
/**
 * Mi espacio never reads every task of the viewer again (#1051): the KPIs,
 * chips, columns and group headers come from `me.tasksSummary` (one grouped
 * SQL read) and the rows from `me.tasksList` pages. This guard keeps the old
 * full read (`fetchMyOpenTasksAction`, `listMyTasks` in the page data, a
 * `TaskListItem[]` under `me.tasks`) and the client-side counting over it
 * from coming back.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

/** Every non-test source of Mi espacio: the page, its loader, its query options and its layouts. */
function miEspacioSources(): string[] {
  const widgets = readdirSync(join(ROOT, "components/widgets"))
    .filter((name) => /^(MiEspacio\w*\.tsx|mi-espacio-[\w-]+\.ts)$/.test(name))
    .map((name) => `components/widgets/${name}`);
  const own = readdirSync(join(ROOT, "components/mi-espacio"))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
    .map((name) => `components/mi-espacio/${name}`);
  return [
    "app/(staff)/mi-espacio/page.tsx",
    "lib/loaders/mi-espacio.ts",
    "lib/query/options/mi-espacio.ts",
    "lib/actions/page-data/mi-espacio-actions.ts",
    ...widgets,
    ...own,
  ];
}

describe("Mi espacio tasks (#1051)", () => {
  it("no full read of my tasks: no fetchMyOpenTasksAction, no listMyTasks, no task array under me.tasks", () => {
    expect(read("lib/actions/tasks-actions.ts")).not.toMatch(/fetchMyOpenTasksAction/);
    const offenders = miEspacioSources().flatMap((file) => {
      const text = read(file);
      const hits: string[] = [];
      if (/fetchMyOpenTasksAction|fetchMyTasksAction|\blistMyTasks\b|\blistTasks\(/.test(text)) hits.push(`${file}: full task read`);
      if (/TaskListItem\[\]>\(\s*qk\.me\.tasks\(\)/.test(text)) hits.push(`${file}: TaskListItem[] under qk.me.tasks()`);
      if (/queryKey:\s*qk\.me\.tasks\(\)\s*,/.test(text)) hits.push(`${file}: a query on the bare me.tasks prefix`);
      return hits;
    });
    expect(offenders).toEqual([]);
  });

  it("every layout counts from the summary and pages its rows", () => {
    for (const file of ["components/widgets/MiEspacioAnalitico.tsx", "components/widgets/MiEspacioBoard.tsx", "components/widgets/MiEspacioEsencial.tsx"]) {
      const text = read(file);
      expect(text, file).toMatch(/meTasksSummaryOptions\(/);
      expect(text, file).toMatch(/meTasksListOptions\(/);
    }
    // The page seeds the summary and first pages, not a list.
    expect(read("lib/loaders/mi-espacio.ts")).toMatch(/myTaskSummary\(/);
  });

  it("the client-side counting over a full list is gone", () => {
    const helpers = read("lib/my-space/my-tasks.ts");
    for (const name of ["openTasksInOrder", "bucketMyTasks", "groupMyTasksByProject", "myTasksGroups", "taskMetrics"]) {
      expect(helpers, name).not.toMatch(new RegExp(`export function ${name}\\b`));
    }
  });
});
