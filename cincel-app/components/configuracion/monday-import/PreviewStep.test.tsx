// @vitest-environment happy-dom
/**
 * Vista previa problems in Spanish with a "Corregir" link to where each gets fixed (#679); warnings grouped by
 * code with counts and sample details with tramo, fase and espacio (project flow §4.9).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderWithQueryClient } from "@/lib/query/test-utils";

const createMondayStaffAction = vi.fn();
const suggestMondayPositionAction = vi.fn();
vi.mock("@/lib/actions/monday-import-actions", () => ({
  createMondayStaffAction: (...args: unknown[]) => createMondayStaffAction(...args),
  suggestMondayPositionAction: (...args: unknown[]) => suggestMondayPositionAction(...args),
}));

import { groupIssues, PreviewStep, sampleDetails } from "./PreviewStep";
import type { MondayPreview, MondayPreviewCounts, MondayPreviewIssue, MondayPreviewSample } from "@/lib/types/monday-import";

const zero: MondayPreviewCounts = {
  proyectos: 0,
  tareas: 0,
  subtareas: 0,
  checklist: 0,
  dependencias: 0,
  contactos: 0,
  comentarios: 0,
  archivos: 0,
  filasCronograma: 0,
  yaImportados: 0,
};

const preview: MondayPreview = {
  canApply: false,
  totals: zero,
  boards: [],
  issues: [
    {
      code: "CLIENT_UNRESOLVED",
      blocking: true,
      boardId: "b1",
      itemId: null,
      boardName: "Proyectos",
      itemName: null,
      message: "El proyecto «Casa Norte» no tiene cliente. Elige uno en Cliente.",
      fixStep: "equivalencias",
    },
    {
      code: "PERSON_UNMATCHED",
      blocking: false,
      boardId: "b1",
      itemId: "i1",
      boardName: "Proyectos",
      itemName: "Muros",
      message: "«Luis» no tiene equivalente en el equipo; sus tareas quedan sin responsable. Elígela en Personas.",
      fixStep: "personas",
    },
  ],
};

afterEach(() => {
  cleanup();
  createMondayStaffAction.mockReset();
  suggestMondayPositionAction.mockReset();
});

/** Expands a warning group by its title and returns its trigger. */
function openGroup(title: string | RegExp) {
  const trigger = screen.getByRole("button", { name: title });
  fireEvent.click(trigger);
  return trigger;
}

function warning(code: string, message: string, extra: Partial<MondayPreviewIssue> = {}): MondayPreviewIssue {
  return {
    code: code as MondayPreviewIssue["code"],
    blocking: false,
    boardId: "b1",
    itemId: null,
    boardName: "Proyectos",
    itemName: null,
    message,
    fixStep: "equivalencias",
    ...extra,
  };
}

const baseCincel: MondayPreviewSample["cincel"] = {
  title: "Muros",
  project: "Casa Nido",
  status: null,
  customStatus: null,
  priority: null,
  manager: null,
  tramo: null,
  phase: null,
  phaseReview: false,
  space: null,
  admin: false,
  commitmentDate: null,
  deliveryDate: null,
  kind: null,
  template: false,
  checklistItems: 0,
  tasks: 0,
  childTasks: 0,
  comments: 0,
  files: 0,
  contactType: null,
};

function taskSample(cincel: Partial<MondayPreviewSample["cincel"]>): MondayPreviewSample {
  return { mondayItemId: "i1", mondayName: "1. Muros", groupTitle: null, entity: "tarea", cincel: { ...baseCincel, ...cincel } };
}

const NEW_ID = "cccccccc-3333-4333-8333-cccccccccccc";
const unmatched: MondayPreview = {
  ...preview,
  issues: [{ ...preview.issues[1], personId: "7", personName: "Luis Prueba" }],
};

describe("PreviewStep", () => {
  it("lists each problem with its board and a Corregir link to its step", () => {
    const onFix = vi.fn();
    renderWithQueryClient(<PreviewStep preview={preview} error="" isPending={false} onRefresh={() => {}} onFix={onFix} />);

    const blocking = screen.getByText("Corrige esto antes de importar").closest("[role=alert]") as HTMLElement;
    expect(within(blocking).getByText(/Proyectos:/)).toBeTruthy();
    expect(within(blocking).getByText(/«Casa Norte» no tiene cliente/)).toBeTruthy();
    fireEvent.click(within(blocking).getByRole("button", { name: "Corregir" }));
    expect(onFix).toHaveBeenCalledWith("equivalencias", "b1");

    openGroup("Personas sin equivalente (1)");
    expect(screen.getByText(/Proyectos › Muros:/)).toBeTruthy();
    const corregir = screen.getAllByRole("button", { name: "Corregir" });
    fireEvent.click(corregir[corregir.length - 1]);
    expect(onFix).toHaveBeenLastCalledWith("personas", "b1");
  });

  it("groups warnings by code with counts, collapsed by default", () => {
    const grouped: MondayPreview = {
      ...preview,
      issues: [
        warning("PHASE_UNRESOLVED", "La tarea «Muros» no tiene fase.", { itemName: "Muros" }),
        warning("PHASE_UNRESOLVED", "La tarea «Pisos» no tiene fase.", { itemName: "Pisos" }),
        warning("CLIENT_MISSING", "El proyecto «Casa Nido» no tiene cliente."),
        warning("STATUS_DEFAULTED", "«Raro» no tiene equivalente."),
        warning("DATES_MISSING", "«Muros» no tiene línea de tiempo."),
        warning("ADMIN_ASSIGNEE_CLEARED", "Se quitó a Ana de una tarea de administración."),
        warning("PERSON_UNMATCHED", "«Luis» no tiene equivalente."),
        warning("SOMETHING_ELSE", "Otro aviso del plan."),
      ],
    };
    renderWithQueryClient(<PreviewStep preview={grouped} error="" isPending={false} onRefresh={() => {}} onFix={() => {}} />);

    for (const title of [
      "Tareas sin fase (2)",
      "Proyectos sin cliente (1)",
      "Estatus sin equivalente (1)",
      "Elementos sin línea de tiempo (1)",
      "Tareas de administración sin responsable (1)",
      "Personas sin equivalente (1)",
      "Otro aviso del plan.",
    ]) {
      expect(screen.getByRole("button", { name: title })).toBeTruthy();
    }
    // Collapsed: the items show once their group opens.
    expect(screen.queryByText(/«Pisos» no tiene fase/)).toBeNull();
    openGroup("Tareas sin fase (2)");
    expect(screen.getByText(/«Muros» no tiene fase/)).toBeTruthy();
    expect(screen.getByText(/«Pisos» no tiene fase/)).toBeTruthy();
  });

  it("titles repeated project names in the blocking list", () => {
    const taken: MondayPreview = {
      ...preview,
      issues: [
        preview.issues[0],
        {
          ...warning("PROJECT_NAME_TAKEN", "Ya hay un proyecto «Casa Nido». Cambia el nombre en Equivalencias."),
          blocking: true,
        },
        {
          ...warning("PROJECT_NAME_TAKEN", "Dos proyectos nuevos se llaman «Casa Mar». Cambia uno en Equivalencias."),
          blocking: true,
        },
      ],
    };
    const onFix = vi.fn();
    renderWithQueryClient(<PreviewStep preview={taken} error="" isPending={false} onRefresh={() => {}} onFix={onFix} />);

    const blocking = screen.getByText("Corrige esto antes de importar").closest("[role=alert]") as HTMLElement;
    expect(within(blocking).getByText("Proyectos con nombre repetido (2)")).toBeTruthy();
    expect(within(blocking).getByText(/«Casa Norte» no tiene cliente/)).toBeTruthy();
    expect(within(blocking).getByText(/Ya hay un proyecto «Casa Nido»/)).toBeTruthy();
    const buttons = within(blocking).getAllByRole("button", { name: "Corregir" });
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[1]);
    expect(onFix).toHaveBeenCalledWith("equivalencias", "b1");
  });

  it("shows a task sample's tramo, fase and espacio", () => {
    const withSamples: MondayPreview = {
      ...preview,
      boards: [
        {
          boardId: "b1",
          name: "Casa Nido",
          strategy: "board_as_project",
          counts: zero,
          samples: [taskSample({ title: "Muros", tramo: "Diseño", phase: "Ejecutivo", space: "Depto 201" })],
        },
      ],
    };
    renderWithQueryClient(<PreviewStep preview={withSamples} error="" isPending={false} onRefresh={() => {}} onFix={() => {}} />);
    expect(screen.getByText(/Tramo · Fase: Diseño · Ejecutivo · Espacio: Depto 201/)).toBeTruthy();
    expect(screen.getByText("1. Muros")).toBeTruthy();
    expect(screen.getByText("Tarea: Muros")).toBeTruthy();
    expect(screen.queryByText(/Workflow:|Área:|Sin workflow/)).toBeNull();
  });

  it("says Administración for admin tasks and flags tasks without fase", () => {
    expect(sampleDetails(taskSample({ admin: true, tramo: null }))).toContain("Administración");
    expect(sampleDetails(taskSample({ admin: true, tramo: null }))).not.toContain("Tramo · Fase");
    expect(sampleDetails(taskSample({ tramo: "Diseño", phase: null, phaseReview: true }))).toContain(
      "Tramo · Fase: Diseño · Sin fase · revisar",
    );
  });

  it("titles unknown codes with the issue text and counts repeats", () => {
    const groups = groupIssues([warning("X", "Aviso uno."), warning("X", "Aviso dos."), warning("Y", "Solo uno.")]);
    expect(groups.map((group) => group.title)).toEqual(["Aviso uno. (2)", "Solo uno."]);
  });

  it("opens an unmatched person's row of Personas (#689)", () => {
    const onFix = vi.fn();
    renderWithQueryClient(<PreviewStep preview={unmatched} error="" isPending={false} onRefresh={() => {}} onFix={onFix} />);
    openGroup("Personas sin equivalente (1)");
    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    expect(onFix).toHaveBeenCalledWith("personas", "b1", "7");
  });

  it("creates the staff member of an unmatched person right in the warning (#689)", async () => {
    const staff = { id: NEW_ID, name: "Luis Prueba", email: "luis@example.test" };
    createMondayStaffAction.mockResolvedValue({ ok: true, staff });
    suggestMondayPositionAction.mockResolvedValue({
      ok: true,
      suggestion: {
        position: { id: "pos-1", name: "Proyectista ejecutivo" },
        tasks: 40,
        topPhases: [{ workflowName: "Diseño", phaseName: "Ejecutivo", tasks: 34 }],
      },
    });
    const onStaffCreated = vi.fn();
    renderWithQueryClient(
      <PreviewStep
        preview={unmatched}
        positions={[{ id: "pos-1", name: "Proyectista ejecutivo" }]}
        error=""
        isPending={false}
        onRefresh={() => {}}
        onFix={() => {}}
        runId="run-1"
        onStaffCreated={onStaffCreated}
      />,
    );
    openGroup("Personas sin equivalente (1)");
    fireEvent.click(screen.getByRole("button", { name: "Crear integrante" }));
    const popover = await screen.findByRole("dialog");
    expect(await within(popover).findByText("Sugerido por sus tareas: 34 de 40 en Diseño · Ejecutivo.")).toBeTruthy();
    fireEvent.click(within(popover).getByRole("button", { name: "Crear integrante" }));
    await waitFor(() => expect(onStaffCreated).toHaveBeenCalledWith("7", staff));
    expect(createMondayStaffAction).toHaveBeenCalledWith("run-1", "7", { positionIds: ["pos-1"] });
  });

  it("offers Crear integrante only on unmatched people with a run", () => {
    renderWithQueryClient(
      <PreviewStep
        preview={preview}
        error=""
        isPending={false}
        onRefresh={() => {}}
        onFix={() => {}}
        runId="run-1"
        onStaffCreated={vi.fn()}
      />,
    );
    openGroup("Personas sin equivalente (1)");
    expect(screen.getByText(/«Luis» no tiene equivalente/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Crear integrante" })).toBeNull();
  });

  it("shows no English plan text", () => {
    renderWithQueryClient(<PreviewStep preview={preview} error="" isPending={false} onRefresh={() => {}} onFix={() => {}} />);
    expect(screen.queryByText(/has no client/)).toBeNull();
  });
});
