// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/proyectos/p1/tareas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({ getProyectoTareasData: vi.fn() }));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { THEME_IDS } from "@/lib/ui/themes";
import type { TaskListItem, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";

import { ProjectTasksByFase } from "./ProjectTasksByFase";

const TODAY = "2026-11-06";
const CONSTRUCCION: WorkflowRef = { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 };
const DEMOLICIONES: WorkflowPhaseRef = { id: "f1", name: "Demoliciones", sortOrder: 1 };
const INSTALACIONES: WorkflowPhaseRef = { id: "f2", name: "Instalaciones", sortOrder: 2 };

function task(id: string, overrides: Partial<TaskListItem>): TaskListItem {
  return {
    id,
    projectId: "p1",
    kind: "workflow",
    title: `Tarea ${id}`,
    status: "pendiente",
    customStatus: null,
    workflow: CONSTRUCCION,
    workflowId: CONSTRUCCION.id,
    phase: null,
    phaseId: null,
    manager: { id: "s1", name: "Paul Langarica" },
    managerId: "s1",
    support: [],
    commitmentDate: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    parentTaskId: null,
    parentTitle: null,
    checklist: { total: 0, completed: 0 },
    archived: false,
    ...overrides,
  } as TaskListItem;
}

const TASKS: TaskListItem[] = [
  task("t1", { phase: DEMOLICIONES, status: "completado", title: "Retiro de muros interiores", subtaskCount: 3, subtaskDoneCount: 3 }),
  task("t2", { phase: INSTALACIONES, status: "en_proceso", title: "Pruebas de presión hidráulica", commitmentDate: "2026-11-12" }),
  task("t3", { phase: INSTALACIONES, title: "Cambiar tapas a WC", commitmentDate: "2026-10-02", manager: null, managerId: null }),
  task("t4", { phase: INSTALACIONES, status: "bloqueado", title: "Pintura de fachada" }),
];

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom does not provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

describe("Proyecto · Tareas accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`has no serious or critical axe violations (${theme}, ${mode}, ${style})`, async () => {
          document.documentElement.setAttribute("data-theme-id", theme);
          document.documentElement.setAttribute("data-theme", mode);
          document.documentElement.classList.toggle("dark", mode === "dark");
          const { container } = render(
            <main>
              <h1>Proyecto</h1>
              <StyleProvider style={style} scope="staff">
                <ProjectTasksByFase projectId="p1" tasks={TASKS} today={TODAY} />
              </StyleProvider>
            </main>,
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }
    }
  }

  it("names every Agregar tarea button after its group", () => {
    const { getAllByRole } = render(
      <StyleProvider style="visual" scope="staff">
        <ProjectTasksByFase projectId="p1" tasks={TASKS} today={TODAY} />
      </StyleProvider>,
    );
    const names = getAllByRole("button", { name: /^Agregar tarea a / }).map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Agregar tarea a Demoliciones", "Agregar tarea a Instalaciones"]);
  });
});
