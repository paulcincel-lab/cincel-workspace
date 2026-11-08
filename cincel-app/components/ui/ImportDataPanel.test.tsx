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

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { ContactDetail, ImportData } from "@/lib/types/core";

const importActions = vi.hoisted(() => ({ getImportDataAction: vi.fn() }));

vi.mock("@/lib/actions/import-actions", () => importActions);
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactHistoryAction: vi.fn().mockResolvedValue([]),
}));

import { ClientDetailSheet } from "@/components/directorio/ClientDetailSheet";
import {
  formatImportValue,
  hasImportData,
  ImportDataPanel,
  importDataFooter,
  useImportData,
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

/** How `TaskSheet` wires the panel: the task's import data, loaded by id. */
function TaskImportData({ taskId }: { taskId: string }) {
  return <ImportDataPanel importData={useImportData("task", taskId)} />;
}

function renderTaskPanel() {
  return renderWithQueryClient(<TaskImportData taskId={TASK_ID} />);
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
  return renderWithQueryClient(
    <ClientDetailSheet
      contact={contact}
      onClose={noop}
      onEdit={noop}
      onDelete={noop}
      canEdit={false}
      canDelete={false}
      isAdmin={false}
    />,
  );
}

describe("Datos de monday in the task sheet and contact sheet", () => {
  it("shows the task's import data", async () => {
    importActions.getImportDataAction.mockResolvedValue(fullData);
    renderTaskPanel();
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
    renderTaskPanel();
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

/** Two consumers of the same row, as when a sheet re-mounts the panel. */
function TwoTaskPanels({ taskId }: { taskId: string | null }) {
  const first = useImportData("task", taskId);
  const second = useImportData("task", taskId);
  return (
    <>
      <ImportDataPanel importData={first} />
      <ImportDataPanel importData={second} />
    </>
  );
}

describe("useImportData query", () => {
  it("caches the load under qk.importData(entity, id)", async () => {
    importActions.getImportDataAction.mockResolvedValue(fullData);
    const { client } = renderTaskPanel();
    await screen.findByRole("button", { name: "Datos de monday" });
    expect(client.getQueryData(qk.importData("task", TASK_ID))).toEqual(
      fullData,
    );
  });

  it("issues one call for every consumer of the same row", async () => {
    importActions.getImportDataAction.mockResolvedValue(fullData);
    renderWithQueryClient(<TwoTaskPanels taskId={TASK_ID} />);
    expect(
      await screen.findAllByRole("button", { name: "Datos de monday" }),
    ).toHaveLength(2);
    expect(importActions.getImportDataAction).toHaveBeenCalledTimes(1);
  });

  it("reuses the cached data on a remount without calling the action again", async () => {
    importActions.getImportDataAction.mockResolvedValue(fullData);
    const client = createTestQueryClient();
    const first = renderWithQueryClient(<TaskImportData taskId={TASK_ID} />, {
      client,
    });
    await screen.findByRole("button", { name: "Datos de monday" });
    first.unmount();
    renderWithQueryClient(<TaskImportData taskId={TASK_ID} />, { client });
    expect(screen.getByRole("button", { name: "Datos de monday" })).toBeTruthy();
    expect(importActions.getImportDataAction).toHaveBeenCalledTimes(1);
  });

  it("does not load without a row id", () => {
    const { container, client } = renderWithQueryClient(
      <TwoTaskPanels taskId={null} />,
    );
    expect(container.innerHTML).toBe("");
    expect(importActions.getImportDataAction).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    expect(client.getQueryCache().getAll()[0]?.state.fetchStatus).toBe("idle");
  });

  it("is side-effect free: only the read action is called, nothing else in the cache changes", async () => {
    importActions.getImportDataAction.mockResolvedValue(fullData);
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const setData = vi.spyOn(client, "setQueryData");
    renderWithQueryClient(<TaskImportData taskId={TASK_ID} />, { client });
    await screen.findByRole("button", { name: "Datos de monday" });
    expect(importActions.getImportDataAction).toHaveBeenCalledTimes(1);
    expect(importActions.getImportDataAction).toHaveBeenCalledWith(
      "task",
      TASK_ID,
    );
    expect(invalidate).not.toHaveBeenCalled();
    expect(setData).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll().map((q) => q.queryKey)).toEqual([
      qk.importData("task", TASK_ID),
    ]);
  });
});
