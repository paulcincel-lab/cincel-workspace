// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import type { TaskDetail } from "@/lib/types/core";

vi.mock("@/lib/actions/tasks-actions", () => ({
  createSubtaskAction: vi.fn(),
  listSubtasksAction: vi.fn(async () => []),
  listTaskDependenciesAction: vi.fn(async () => ({ dependsOn: [], blocks: [] })),
}));
vi.mock("@/lib/actions/import-actions", () => ({
  getImportDataAction: vi.fn().mockResolvedValue(null),
}));

import TaskDrawer from "./TaskDrawer";

const DISENO = { id: "w-diseno", key: "diseno", name: "Diseño", sortOrder: 2 };
const PRESALE = { id: "w-presale", key: "presale", name: "Presale", sortOrder: 1 };
const PHASES = [
  { id: "f-ante", name: "Anteproyecto", sortOrder: 1 },
  { id: "f-ejec", name: "Ejecutivo", sortOrder: 2 },
];
const SPACES = [{ id: "e-201", name: "Depto 201" }];

function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: "t-1",
    projectId: "p-1",
    kind: "usuario",
    templateId: null,
    workflowId: DISENO.id,
    phase: null,
    phaseId: "f-ante",
    spaceId: null,
    closedAt: null,
    title: "Planos de conjunto",
    notes: null,
    createdById: "s-9",
    managerId: null,
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    customStatus: null,
    project: { id: "p-1", name: "Casa Lomas", clientName: null },
    workflow: DISENO,
    areaColorSlot: null,
    phaseRef: PHASES[0],
    space: null,
    manager: null,
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    createdBy: { id: "s-9", name: "Ana López" },
    checklistItems: [],
    attachments: [],
    links: [],
    history: [],
    ...overrides,
  } as TaskDetail;
}

const noop = () => {};

afterEach(cleanup);

function renderDrawer(task: TaskDetail, props: Partial<ComponentProps<typeof TaskDrawer>> = {}) {
  return render(
    <TaskDrawer
      open
      task={task}
      onClose={noop}
      onAddComment={noop}
      onAddChecklistItem={noop}
      onToggleChecklistItem={noop}
      onRemoveChecklistItem={noop}
      {...props}
    />,
  );
}

describe("TaskDrawer fase, espacio and tramo", () => {
  it("shows the Tramo · Fase chip and the espacio chip", () => {
    renderDrawer(makeTask({ spaceId: "e-201", space: SPACES[0] }));
    expect(screen.getByText("Diseño · Anteproyecto")).toBeTruthy();
    expect(screen.getByText("Depto 201")).toBeTruthy();
  });

  it("lists only the given tramo fases and saves the picked one", async () => {
    const onChangePhase = vi.fn();
    renderDrawer(makeTask(), { phases: PHASES, onChangePhase });

    fireEvent.click(screen.getByRole("combobox", { name: "Fase" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Anteproyecto", "Ejecutivo"]);
    fireEvent.click(screen.getByRole("option", { name: "Ejecutivo" }));
    expect(onChangePhase).toHaveBeenCalledWith("f-ejec");
  });

  it("hides the Espacio select when the project has no espacios", () => {
    renderDrawer(makeTask(), { spaces: [], onChangeSpace: vi.fn() });
    expect(screen.queryByRole("combobox", { name: "Espacio" })).toBeNull();
  });

  it("saves the picked espacio", async () => {
    const onChangeSpace = vi.fn();
    renderDrawer(makeTask(), { spaces: SPACES, onChangeSpace });
    fireEvent.click(screen.getByRole("combobox", { name: "Espacio" }));
    fireEvent.click(await screen.findByRole("option", { name: "Depto 201" }));
    expect(onChangeSpace).toHaveBeenCalledWith("e-201");
  });

  it("offers a Tramo select only for a task without tramo", async () => {
    const onChangeTramo = vi.fn();
    const { unmount } = renderDrawer(makeTask(), { tramos: [PRESALE, DISENO], onChangeTramo });
    expect(screen.queryByRole("combobox", { name: "Tramo" })).toBeNull();
    unmount();

    renderDrawer(makeTask({ workflowId: null, workflow: null, phaseId: null, phaseRef: null }), {
      tramos: [PRESALE, DISENO],
      onChangeTramo,
      phases: PHASES,
      onChangePhase: vi.fn(),
    });
    expect(screen.queryByRole("combobox", { name: "Fase" })).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "Tramo" }));
    fireEvent.click(await screen.findByRole("option", { name: "Presale" }));
    expect(onChangeTramo).toHaveBeenCalledWith(PRESALE.id);
  });

  it("shows no fase or espacio selects for an admin task", () => {
    renderDrawer(makeTask({ kind: "admin", workflowId: null, workflow: null, phaseId: null, phaseRef: null }), {
      phases: PHASES,
      onChangePhase: vi.fn(),
      spaces: SPACES,
      onChangeSpace: vi.fn(),
    });
    expect(screen.getByText("Administración")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Fase" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Espacio" })).toBeNull();
  });
});
