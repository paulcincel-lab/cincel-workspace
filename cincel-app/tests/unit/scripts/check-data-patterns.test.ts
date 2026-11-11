// @vitest-environment node
/**
 * `scripts/check-data-patterns.mjs` (plan §5.0): fixtures for each pattern,
 * the auth allowance, the keep-list and the CLI exit codes.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { checkSource } from "../../../scripts/check-data-patterns.mjs";

type Violation = { file: string; line: number; pattern: string };
const check = (file: string, text: string) => checkSource(file, text) as Violation[];
const patterns = (file: string, text: string) => check(file, text).map((v) => `${v.line} ${v.pattern}`);

const MULTILINE_EFFECT = `"use client";
import { useEffect, useState } from "react";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";

export function Tasks({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const rows = await fetchTasksAction({
        projectId,
      });
      if (!cancelled) setTasks(rows.map((r) => r.id));
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return <ul>{tasks.length}</ul>;
}
`;

const CLEAN = `"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { qk } from "@/lib/query/keys";
import { fetchInicioAction } from "@/lib/actions/page-data/inicio-actions";

// router.refresh() in a comment is not a call; neither is "revalidatePath(".
export function Inicio() {
  const { data } = useQuery({ queryKey: qk.inicio(), queryFn: () => fetchInicioAction({}) });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.title = open ? "Abierto" : "Inicio";
  }, [open]);
  return <button onClick={() => setOpen(true)}>{data?.greeting}</button>;
}
`;

describe("checkSource", () => {
  it("catches a multi-line useEffect that calls an imported action", () => {
    expect(patterns("components/Tasks.tsx", MULTILINE_EFFECT)).toEqual(["10 useEffect → fetchTasksAction("]);
  });

  it("passes a clean file", () => {
    expect(check("components/Inicio.tsx", CLEAN)).toEqual([]);
  });

  it("allows router.refresh() on a line ending in // data-patterns: auth, and flags it otherwise", () => {
    const text = `export function SignOut({ router }: { router: { refresh(): void } }) {
  router.refresh(); // data-patterns: auth
  router
    .refresh();
}
`;
    expect(patterns("components/SignOut.tsx", text)).toEqual(["3 router.refresh("]);
  });

  it("catches startTransition bodies that fetch or call a load/reload/refetch helper", () => {
    const text = `import { startTransition, useTransition } from "react";
export function A({ reload }: { reload: () => void }) {
  const [, start] = useTransition();
  startTransition(async () => {
    const res = await fetch("/api/x");
    void res;
  });
  startTransition(() => {
    reload();
  });
  startTransition(() => loadProjects());
  return start;
}
declare function loadProjects(): void;
`;
    expect(patterns("components/A.tsx", text)).toEqual([
      "5 startTransition → fetch(",
      "9 startTransition → reload(",
      "11 startTransition → loadProjects(",
    ]);
  });

  it("ignores *Action calls that are not imported (a local mutation callback, say)", () => {
    const text = `import { useEffect } from "react";
export function A({ onSaveAction }: { onSaveAction: () => void }) {
  useEffect(() => { onSaveAction(); }, [onSaveAction]);
  return null;
}
`;
    expect(check("components/A.tsx", text)).toEqual([]);
  });

  it("catches a setInterval that loads data, not one that only ticks", () => {
    const text = `import { fetchTodayAction } from "@/lib/actions/time-tracking-actions";
export function start(setNow: (d: Date) => void) {
  setInterval(() => setNow(new Date()), 1000);
  setInterval(async () => {
    await fetchTodayAction();
  }, 60_000);
}
`;
    expect(patterns("components/Clock.tsx", text)).toEqual(["4 setInterval( → fetchTodayAction("]);
  });

  it("catches useState copies of server props", () => {
    const text = `import { useState } from "react";
export function A(props: { rows: string[] }, { initialTasks }: { initialTasks: string[] }) {
  const [a] = useState(initialTasks);
  const [b] = useState(() => initialTasks.slice());
  const [c] = useState(props.rows);
  const [d] = useState<string[]>([]);
  return [a, b, c, d];
}
`;
    expect(patterns("components/A.tsx", text)).toEqual([
      "3 useState(initialTasks",
      "4 useState(initialTasks.slice",
      "5 useState(props.rows",
    ]);
  });

  it("flags revalidatePath except ('/', 'layout') in the keep-list and the screen helpers", () => {
    const text = `import { revalidatePath } from "next/cache";
export function x() {
  revalidatePath("/", "layout");
  revalidatePath("/tareas");
}
`;
    expect(patterns("lib/actions/app-settings-actions.ts", text)).toEqual(["4 revalidatePath("]);
    expect(patterns("lib/actions/tasks-actions.ts", text)).toEqual(["3 revalidatePath(", "4 revalidatePath("]);
    expect(check("lib/cache/screens/tareas.ts", text)).toEqual([]);
  });

  it("catches cincel: window events, literal or through a same-file constant", () => {
    const text = `const OPEN = "cincel:open-thing";
export function a() {
  window.dispatchEvent(new Event(OPEN));
  window.dispatchEvent(new CustomEvent<number>("cincel:count", { detail: 1 }));
  window.dispatchEvent(new Event("focus"));
}
`;
    expect(patterns("components/a.ts", text)).toEqual([
      '3 window.dispatchEvent(new Event("cincel:open-thing")',
      '4 window.dispatchEvent(new CustomEvent("cincel:count")',
    ]);
  });
});

describe("#1051 rules", () => {
  it("flags a Zustand store hook called without a selector, not one with a selector", () => {
    const text = `import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { useHideCompletedPreference } from "@/lib/stores/appearance-store";
export function A() {
  const all = useNewTaskUi();
  const open = useNewTaskUi((s) => s.open);
  const [pref] = useHideCompletedPreference();
  return all && open && pref;
}
`;
    expect(patterns("components/A.tsx", text)).toEqual(["4 useNewTaskUi() without a selector"]);
  });

  it("flags a queryFn that filters a full action list on the client", () => {
    const text = `import { fetchMyTasksAction } from "@/lib/actions/tasks-actions";
export const opts = {
  queryKey: ["me", "tasks", "closed"],
  queryFn: async () => (await fetchMyTasksAction()).filter((t) => t.closed),
};
export const ok = { queryKey: ["x"], queryFn: () => fetchMyTasksAction() };
`;
    expect(patterns("lib/query/options/a.ts", text)).toEqual(["4 queryFn → fetchMyTasksAction(…).filter("]);
  });

  it("flags a sort over infinite-query pages unless it keeps the server's order", () => {
    const text = `export function rowsOf(pages: { rows: { due: string }[] }[]) {
  return useMemo(() => sortByDueDate(pages.flatMap((p) => p.rows)), [pages]);
}
export function eventsOf(data: { pages: { events: { at: string }[] }[] }) {
  return data.pages
    .flatMap((p) => p.events)
    .sort((a, b) => b.at.localeCompare(a.at)); // data-patterns: server-order
}
export function plain(rows: number[]) {
  return rows.sort();
}
`;
    expect(patterns("components/a.tsx", text)).toEqual(["2 sortByDueDate( over paged rows"]);
  });

  it("flags a full task read in the Resumen, not the task numbers nor an invalidation key list", () => {
    const text = `export function Resumen({ id }: { id: string }) {
  const tareas = useQuery(proyectoTareasOptions(id));
  const cached = qc.getQueryData(qk.proyectos.tab(id, "tareas"));
  const numbers = useQuery(proyectoResumenSummaryOptions(id));
  const invalidate = [qk.proyectos.tab(id, "tareas"), qk.proyectos.resumen(id)];
  const ficha = useQuery({ queryKey: qk.proyectos.tab(id, "ficha") });
  return null;
}
`;
    const flagged = ["2 Resumen full task read → proyectoTareasOptions(", '3 Resumen full task read → qk.proyectos.tab(…, "tareas")'];
    expect(patterns("components/widgets/ResumenAnaliticoLayout.tsx", text)).toEqual(flagged);
    expect(patterns("components/proyectos/ProjectSummary.tsx", text)).toEqual(flagged);
    expect(patterns("app/(staff)/proyectos/[id]/page.tsx", "const rows = await listTaskRows({ projectId: id }, viewer);\n")).toEqual([
      "1 Resumen full task read → listTaskRows(",
    ]);
    // Other screens may read the project's Tareas tab key.
    expect(patterns("components/proyectos/ProjectTasksByFase.tsx", text)).toEqual([]);
  });
});

describe("CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "data-patterns-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const script = join(__dirname, "../../../scripts/check-data-patterns.mjs");

  it("exits 1 and prints file:line pattern for a violation, 0 for a clean file", () => {
    const bad = join(dir, "Tasks.tsx");
    const good = join(dir, "Inicio.tsx");
    writeFileSync(bad, MULTILINE_EFFECT);
    writeFileSync(good, CLEAN);

    const failed = spawnSync(process.execPath, [script, bad, good], { encoding: "utf8" });
    expect(failed.status).toBe(1);
    expect(failed.stdout).toMatch(/Tasks\.tsx:10 useEffect → fetchTasksAction\(/);
    expect(failed.stdout).not.toMatch(/Inicio\.tsx/);

    const passed = spawnSync(process.execPath, [script, good], { encoding: "utf8" });
    expect(passed.status).toBe(0);
    expect(passed.stdout).toBe("");
  });

  it("exits 2 without files", () => {
    expect(spawnSync(process.execPath, [script], { encoding: "utf8" }).status).toBe(2);
  });
});
