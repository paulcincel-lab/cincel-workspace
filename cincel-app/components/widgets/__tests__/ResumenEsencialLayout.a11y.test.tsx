// @vitest-environment happy-dom
import { cleanup, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos/p1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoResumenData: vi.fn(),
  getProyectoResumenSummary: vi.fn(),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: true }),
}));
vi.mock("@/components/tareas/TaskSheet", () => ({
  TaskSheetRoute: () => null,
  taskSheetHref: (pathname: string, _search: unknown, id: string) => `${pathname}?tarea=${id}`,
}));
vi.mock("@/components/tareas/quick-add-create", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/tareas/quick-add-create")>()),
  useQuickAddCreate: () => ({ create: vi.fn(), undo: vi.fn() }),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TaskListRow } from "@/lib/types/core";
import { TRAMOS, fixtureSummaryInput } from "@/tests/unit/fixtures/project-summary";
import { seedResumenTasks } from "@/tests/unit/fixtures/resumen-summary";

import { ResumenEsencialLayout } from "../ResumenEsencialLayout";

const TASKS = [
  {
    id: "a",
    title: "Colocar plafón",
    status: "pendiente",
    archived: false,
    commitmentDate: "2026-11-01",
    workflowId: "w-construccion",
    workflow: TRAMOS[2],
    phase: null,
    manager: { id: "s1", name: "Paul Langarica" },
    parentTaskId: null,
    subtaskCount: 0,
    subtaskDone: 0,
  },
] as unknown as TaskListRow[];

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout; the token pairs are covered in lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

function renderPage() {
  const client = createTestQueryClient();
  const input = fixtureSummaryInput();
  seedResumenTasks(client, input, TASKS);
  return renderWithQueryClient(
    <StyleProvider style="esencial" scope="staff">
      <main>
        <ResumenEsencialLayout data={input} />
      </main>
    </StyleProvider>,
    { client },
  );
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

describe("Proyecto · Resumen Esencial accessibility", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`Resumen Esencial has no serious or critical axe violations (${mode})`, async () => {
      document.documentElement.setAttribute("data-theme", mode);
      document.documentElement.classList.toggle("dark", mode === "dark");
      const { container } = renderPage();
      expect(await seriousViolations(container)).toEqual([]);
    });
  }

  it("tramo line has a text alternative", () => {
    renderPage();
    const line = within(screen.getByRole("region", { name: "Tramos" })).getByRole("img");
    expect(line.getAttribute("aria-label")).toBe(
      "Tramos: Presale terminado 100 %, Diseño terminado 100 %, Construcción en curso fase 2 de 3",
    );
    for (const dot of line.querySelectorAll("span")) expect(dot.getAttribute("aria-hidden")).toBe("true");
  });

  it("quick-add field is labelled", () => {
    renderPage();
    const card = screen.getByRole("region", { name: "Próximas tareas" });
    const field = within(card).getByRole<HTMLInputElement>("textbox");
    expect(field.getAttribute("aria-label") || field.labels?.[0]?.textContent || "").not.toBe("");
  });
});
