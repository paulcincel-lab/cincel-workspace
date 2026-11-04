// @vitest-environment happy-dom
/** Vista previa problems in Spanish with a "Corregir" link to where each gets fixed (#679). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { PreviewStep } from "./PreviewStep";
import type { MondayPreview, MondayPreviewCounts } from "@/lib/types/monday-import";

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

afterEach(cleanup);

describe("PreviewStep", () => {
  it("lists each problem with its board and a Corregir link to its step", () => {
    const onFix = vi.fn();
    render(<PreviewStep preview={preview} error="" isPending={false} onRefresh={() => {}} onFix={onFix} />);

    const blocking = screen.getByText("Corrige esto antes de importar").closest("[role=alert]") as HTMLElement;
    expect(within(blocking).getByText(/Proyectos:/)).toBeTruthy();
    expect(within(blocking).getByText(/«Casa Norte» no tiene cliente/)).toBeTruthy();
    fireEvent.click(within(blocking).getByRole("button", { name: "Corregir" }));
    expect(onFix).toHaveBeenCalledWith("equivalencias", "b1");

    const warnings = screen.getByText("Avisos").closest("[role=alert]") as HTMLElement;
    expect(within(warnings).getByText(/Proyectos › Muros:/)).toBeTruthy();
    fireEvent.click(within(warnings).getByRole("button", { name: "Corregir" }));
    expect(onFix).toHaveBeenLastCalledWith("personas", "b1");
  });

  it("says the workflow and phases a project gets, or that the groups stay task labels (#678)", () => {
    const cincel = {
      title: "Casa Nido",
      project: null,
      status: "Activo",
      customStatus: null,
      priority: null,
      manager: null,
      phase: "Diseño, Obra",
      workflow: "Construcción",
      commitmentDate: null,
      deliveryDate: null,
      kind: null,
      template: false,
      checklistItems: 0,
      tasks: 2,
      childTasks: 0,
      comments: 0,
      files: 0,
      contactType: null,
    };
    const withProjects: MondayPreview = {
      ...preview,
      boards: [
        {
          boardId: "b1",
          name: "Casa Nido",
          strategy: "board_as_project",
          counts: zero,
          samples: [{ mondayItemId: "b1", mondayName: "Casa Nido", groupTitle: null, entity: "proyecto", cincel }],
        },
        {
          boardId: "b2",
          name: "Obras",
          strategy: "group_as_project",
          counts: zero,
          samples: [
            {
              mondayItemId: "b2:g1",
              mondayName: "Casa Mar",
              groupTitle: null,
              entity: "proyecto",
              cincel: { ...cincel, title: "Casa Mar", phase: null, workflow: null },
            },
          ],
        },
      ],
    };
    render(<PreviewStep preview={withProjects} error="" isPending={false} onRefresh={() => {}} onFix={() => {}} />);
    expect(screen.getByText(/Workflow: Construcción · Fases del proyecto: Diseño, Obra/)).toBeTruthy();
    expect(screen.getByText(/Sin workflow · Sin fases: los grupos quedan solo como etiqueta de las tareas/)).toBeTruthy();
  });

  it("shows no English plan text", () => {
    render(<PreviewStep preview={preview} error="" isPending={false} onRefresh={() => {}} onFix={() => {}} />);
    expect(screen.queryByText(/has no client/)).toBeNull();
  });
});
