// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import axe from "axe-core";

vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: vi.fn(async () => []),
  fetchCatalogAssignableStaff: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/tasks-actions", () => ({
  deleteTaskAction: vi.fn(),
  createUserTaskAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/settings/use-general-settings", async () => {
  const { GENERAL_SETTINGS_DEFAULTS } = await import("@/lib/settings/general-settings");
  return { useGeneralSettings: () => GENERAL_SETTINGS_DEFAULTS };
});

import { WORKFLOWS } from "@/components/tareas/new-task-fixtures";
import { newTaskWorkflowsKey } from "@/components/tareas/quick-add-create";
import { QuickAddRow, type QuickAddRowProps } from "@/components/widgets/QuickAddRow";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { CatalogAssignableStaffOption } from "@/lib/types/catalog";
import { settle } from "@/tests/helpers/settle";

const STAFF: CatalogAssignableStaffOption[] = [
  { id: "p-luis", name: "Luis Pérez", suggested: true, openCount: 2, overdueCount: 0 },
  { id: "p-luisa", name: "Luisa Gómez", suggested: true, openCount: 1, overdueCount: 0 },
];

const MODES = ["light", "dark"] as const;

function setMode(mode: (typeof MODES)[number]) {
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

async function seriousViolations() {
  await settle();
  const results = await axe.run(document.body);
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function renderRow(variant: QuickAddRowProps["variant"]) {
  const client = createTestQueryClient();
  client.setQueryData(newTaskWorkflowsKey(), WORKFLOWS);
  client.setQueryData(qk.catalog.assignableStaff("w-diseno"), STAFF);
  const ui = (
    <QuickAddRow
      context={{ label: "Diseño", projectId: "p-roble", etapaId: "w-diseno", assigneeId: null }}
      variant={variant}
      colSpan={3}
      onCreate={vi.fn(async () => ({ id: "t-1", title: "Revisar" }))}
    />
  );
  renderWithQueryClient(
    <main>
      <h1>Tareas</h1>
      {variant === "row" ? (
        <table>
          <caption>Tareas de Diseño</caption>
          <thead>
            <tr>
              <th scope="col">Tarea</th>
              <th scope="col">Responsable</th>
              <th scope="col">Fecha</th>
            </tr>
          </thead>
          <tbody>{ui}</tbody>
        </table>
      ) : (
        ui
      )}
    </main>,
    { client },
  );
  const input = screen.getByRole("textbox", { name: "Nueva tarea en Diseño" });
  fireEvent.focus(input);
  return input;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T18:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
  document.body.innerHTML = "";
});

describe("QuickAddRow a11y", () => {
  for (const mode of MODES) {
    for (const variant of ["row", "card", "column"] as const) {
      it(`${mode} · ${variant}: idle has no serious or critical violations`, async () => {
        setMode(mode);
        renderRow(variant);
        expect(await seriousViolations()).toEqual([]);
      });

      it(`${mode} · ${variant}: chips and suggestion have no serious or critical violations`, async () => {
        setMode(mode);
        const input = renderRow(variant);
        fireEvent.change(input, { target: { value: "Revisar planos @lu viernes !alta" } });
        expect(await seriousViolations()).toEqual([]);
      });
    }
  }

  it('the role="status" live region announces the suggestion', () => {
    const input = renderRow("row");
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(input.getAttribute("aria-describedby")).toContain(region.id);
    fireEvent.change(input, { target: { value: "@lu revisar" } });
    expect(region.textContent).toContain("¿Quién? Luis Pérez o Luisa Gómez.");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
  });
});
