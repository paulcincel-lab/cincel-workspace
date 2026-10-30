// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import type { ContactDetail, ImportData, TaskDetail } from "@/lib/types/core";

const importActions = vi.hoisted(() => ({ getImportDataAction: vi.fn() }));

vi.mock("@/lib/actions/import-actions", () => importActions);
vi.mock("@/lib/actions/tasks-actions", () => ({
  createSubtaskAction: vi.fn(),
  listSubtasksAction: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactHistoryAction: vi.fn().mockResolvedValue([]),
}));

import TaskDrawer from "@/components/tareas/TaskDrawer";
import { ClientDetailSheet } from "@/components/directorio/ClientDetailSheet";
import {
  formatImportValue,
  hasImportData,
  ImportDataPanel,
  importDataFooter,
} from "./ImportDataPanel";

const TASK_ID = "00000000-0000-4000-8000-0000000000a1";
const CONTACT_ID = "00000000-0000-4000-8000-0000000000b1";

function makeImportData(data: Record<string, unknown>): ImportData {
  return {
    source: "monday",
    importedAt: "2026-10-15T18:00:00.000Z",
    boardName: "Obras 2026",
    groupTitle: "En curso",
    data,
  };
}

const fullData = makeImportData({
  columns: {
    Presupuesto: "120000",
    Etiquetas: ["Urgente", "Cliente VIP"],
    Plano: "https://example.com/plano.pdf",
  },
  start: "2026-09-01",
  milestone: true,
  subitems: {
    "901": { name: "Muros", columns: { Avance: "50%" } },
    "902": { name: "Pisos", columns: {} },
  },
});

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Datos de monday" }));
}

function rowValue(label: string): HTMLElement {
  const row = screen.getByRole("columnheader", { name: label }).closest("tr");
  if (!row) throw new Error(`row ${label} not found`);
  return within(row).getByRole("cell");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("formatImportValue", () => {
  it("keeps strings as text and joins arrays with commas", () => {
    expect(formatImportValue("Concreto")).toBe("Concreto");
    expect(formatImportValue(["A", "B", "C"])).toBe("A, B, C");
  });

  it("drops empty values", () => {
    expect(formatImportValue("  ")).toBeNull();
    expect(formatImportValue([])).toBeNull();
    expect(formatImportValue(null)).toBeNull();
  });
});

describe("importDataFooter", () => {
  it("lists date, board and group", () => {
    expect(importDataFooter(fullData)).toMatch(
      /^Importado de monday el \d{2}-\d{2}-2026 · tablero Obras 2026 · grupo En curso$/,
    );
  });

  it("omits a missing board or group", () => {
    const footer = importDataFooter({
      ...fullData,
      boardName: null,
      groupTitle: null,
    });
    expect(footer).toMatch(/^Importado de monday el \d{2}-\d{2}-2026$/);
  });
});

describe("ImportDataPanel", () => {
  it("is collapsed until opened", () => {
    render(<ImportDataPanel importData={fullData} />);
    expect(screen.queryByText("Presupuesto")).toBeNull();
    openPanel();
    expect(screen.getByText("Presupuesto")).toBeTruthy();
  });

  it("formats strings, arrays, links, Inicio and Hito", () => {
    render(<ImportDataPanel importData={fullData} />);
    openPanel();
    expect(rowValue("Presupuesto").textContent).toBe("120000");
    expect(rowValue("Etiquetas").textContent).toBe("Urgente, Cliente VIP");
    const link = within(rowValue("Plano")).getByRole("link");
    expect(link.getAttribute("href")).toBe("https://example.com/plano.pdf");
    expect(rowValue("Inicio").textContent).toBe("01-09-2026");
    expect(rowValue("Hito").textContent).toBe("Sí");
  });

  it("lists checklist subitems with their columns", () => {
    render(<ImportDataPanel importData={fullData} />);
    openPanel();
    expect(screen.getByRole("heading", { name: "Muros" })).toBeTruthy();
    expect(rowValue("Avance").textContent).toBe("50%");
    // A subitem without values isn't listed.
    expect(screen.queryByRole("heading", { name: "Pisos" })).toBeNull();
  });

  it("shows the import footer", () => {
    render(<ImportDataPanel importData={fullData} />);
    openPanel();
    expect(screen.getByText(/Importado de monday el/).textContent).toContain(
      "tablero Obras 2026 · grupo En curso",
    );
  });

  it("is hidden without data", () => {
    const { container } = render(<ImportDataPanel importData={null} />);
    expect(container.innerHTML).toBe("");
    const empty = makeImportData({ columns: {} });
    expect(hasImportData(empty)).toBe(false);
    render(<ImportDataPanel importData={empty} />);
    expect(screen.queryByText("Datos de monday")).toBeNull();
  });
});

const noop = () => {};

function makeTask(): TaskDetail {
  return {
    id: TASK_ID,
    projectId: "00000000-0000-4000-8000-000000000001",
    kind: "usuario",
    templateId: null,
    workflowId: null,
    phase: null,
    title: "Planos arquitectónicos",
    notes: null,
    createdById: "00000000-0000-4000-8000-000000000009",
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
    project: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Casa Lomas",
      clientName: "Cliente",
    },
    workflow: null,
    areaColorSlot: null,
    manager: null,
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    createdBy: { id: "00000000-0000-4000-8000-000000000009", name: "Ana" },
    checklistItems: [],
    attachments: [],
    links: [],
    history: [],
  };
}

function renderDrawer() {
  return render(
    <TaskDrawer
      open
      task={makeTask()}
      onClose={noop}
      onAddComment={noop}
      onAddChecklistItem={noop}
      onToggleChecklistItem={noop}
      onRemoveChecklistItem={noop}
    />,
  );
}

const contact = {
  id: CONTACT_ID,
  name: "Familia Ruiz",
  type: "cliente",
  kind: "particular",
  email: null,
  phone: null,
  notes: null,
  acquisitionChannel: null,
  stats: null,
  people: [],
  projects: [],
} as unknown as ContactDetail;

function renderContactSheet() {
  return render(
    <ClientDetailSheet
      contact={contact}
      onClose={noop}
      onEdit={noop}
      onDelete={noop}
      canEdit={false}
      canDelete={false}
    />,
  );
}

describe("Datos de monday in the task drawer and contact sheet", () => {
  it("shows the task's import data", async () => {
    importActions.getImportDataAction.mockResolvedValue(fullData);
    renderDrawer();
    expect(
      await screen.findByRole("button", { name: "Datos de monday" }),
    ).toBeTruthy();
    expect(importActions.getImportDataAction).toHaveBeenCalledWith(
      "task",
      TASK_ID,
    );
  });

  it("hides the panel on a task that wasn't imported", async () => {
    importActions.getImportDataAction.mockResolvedValue(null);
    renderDrawer();
    await waitFor(() =>
      expect(importActions.getImportDataAction).toHaveBeenCalled(),
    );
    expect(screen.queryByText("Datos de monday")).toBeNull();
  });

  it("shows the contact's import data", async () => {
    importActions.getImportDataAction.mockResolvedValue(fullData);
    renderContactSheet();
    expect(
      await screen.findByRole("button", { name: "Datos de monday" }),
    ).toBeTruthy();
    expect(importActions.getImportDataAction).toHaveBeenCalledWith(
      "contact",
      CONTACT_ID,
    );
  });

  it("hides the panel on a contact that wasn't imported", async () => {
    importActions.getImportDataAction.mockResolvedValue(null);
    renderContactSheet();
    await waitFor(() =>
      expect(importActions.getImportDataAction).toHaveBeenCalled(),
    );
    expect(screen.queryByText("Datos de monday")).toBeNull();
  });
});
