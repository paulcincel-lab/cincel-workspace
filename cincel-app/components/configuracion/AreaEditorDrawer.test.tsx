// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { AreaDetail } from "@/lib/types/core";

import { AreaEditorDrawer, type AreaDraft } from "./AreaEditorDrawer";

const area: AreaDetail = {
  id: "a1",
  name: "Diseño",
  description: null,
  leadId: null,
  active: true,
  sortOrder: 0,
  colorSlot: 1,
  lead: null,
  members: [],
  workflows: [],
};

function renderDrawer(overrides: { editingArea?: AreaDetail | null; draft?: Partial<AreaDraft>; memberNames?: string[] } = {}) {
  const draft: AreaDraft = { name: "Diseño", description: "", leadId: null, active: true, ...overrides.draft };
  return render(
    <AreaEditorDrawer
      show
      onClose={vi.fn()}
      editingArea={overrides.editingArea === undefined ? area : overrides.editingArea}
      draft={draft}
      onChangeDraft={vi.fn()}
      formError=""
      onSaveBasic={vi.fn()}
      isSaving={false}
      staffOptions={[{ id: "s1", name: "Ana López" }]}
      workflowOptions={[{ id: "w1", name: "Diseño" }]}
      memberNames={overrides.memberNames ?? []}
      onChangeMemberNames={vi.fn()}
      onSaveMembers={vi.fn()}
      workflowNames={[]}
      onChangeWorkflowNames={vi.fn()}
      onSaveWorkflows={vi.fn()}
      capabilities={{ canViewPositions: true, canManagePositions: true }}
    />,
  );
}

describe("AreaEditorDrawer", () => {
  afterEach(cleanup);

  it("shows Automático instead of the raw value when an edited área has no color yet", () => {
    renderDrawer({ draft: { colorSlot: undefined } });
    expect(screen.queryByText("__auto__")).toBeNull();
    expect(screen.getByText("Automático")).toBeTruthy();
  });

  it("uses the workflows empty text under Workflows asignados", () => {
    renderDrawer();
    expect(screen.getByText("Sin workflows asignados")).toBeTruthy();
    expect(screen.getAllByText("Sin integrantes asignados")).toHaveLength(1);
  });

  it("has a single close control", () => {
    renderDrawer();
    expect(screen.getAllByText("Cerrar")).toHaveLength(1);
  });

  it("keeps the save buttons above the chip rows so adding chips does not move them", () => {
    renderDrawer({ memberNames: ["Ana López"] });
    const saveMembers = screen.getByRole("button", { name: "Guardar miembros" });
    const chip = screen.getByTitle("Quitar integrante");
    expect(saveMembers.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const saveWorkflows = screen.getByRole("button", { name: "Guardar workflows" });
    const workflowsEmpty = screen.getByText("Sin workflows asignados");
    expect(saveWorkflows.compareDocumentPosition(workflowsEmpty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
