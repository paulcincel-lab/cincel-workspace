// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { ImportData } from "@/lib/types/core";

const importActions = vi.hoisted(() => ({ getImportDataAction: vi.fn() }));
vi.mock("@/lib/actions/import-actions", () => importActions);

import { ImportDataPanel, useImportData } from "./ImportDataPanel";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

/** The ficha's wiring: load the project's import data, then hand it to the panel. */
function ProjectImportData({ projectId }: { projectId: string }) {
  const importData = useImportData("project", projectId);
  return <ImportDataPanel importData={importData} />;
}

function makeImportData(columns: Record<string, unknown>): ImportData {
  return {
    source: "monday",
    importedAt: "2026-10-15T18:00:00.000Z",
    boardName: "Obras 2026",
    groupTitle: "En curso",
    data: { columns },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ImportDataPanel with project data (B2)", () => {
  it("renders nothing when the action returns null", async () => {
    importActions.getImportDataAction.mockResolvedValue(null);
    const { container } = renderWithQueryClient(<ProjectImportData projectId={PROJECT_ID} />);
    await waitFor(() => expect(importActions.getImportDataAction).toHaveBeenCalledWith("project", PROJECT_ID));
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("Datos de monday")).toBeNull();
  });

  it("renders nothing when the action fails", async () => {
    importActions.getImportDataAction.mockRejectedValue(new Error("FORBIDDEN"));
    const { container } = renderWithQueryClient(<ProjectImportData projectId={PROJECT_ID} />);
    await waitFor(() => expect(importActions.getImportDataAction).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the only values were the client columns removed for non-admins", async () => {
    importActions.getImportDataAction.mockResolvedValue(makeImportData({}));
    const { container } = renderWithQueryClient(<ProjectImportData projectId={PROJECT_ID} />);
    await waitFor(() => expect(importActions.getImportDataAction).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("shows the panel when the action returns data", async () => {
    importActions.getImportDataAction.mockResolvedValue(makeImportData({ Cliente: "Familia Ruiz", Presupuesto: "120000" }));
    renderWithQueryClient(<ProjectImportData projectId={PROJECT_ID} />);
    expect(await screen.findByRole("button", { name: "Datos de monday" })).toBeTruthy();
  });

  it("renders nothing for null data passed directly", () => {
    const { container } = render(<ImportDataPanel importData={null} />);
    expect(container.innerHTML).toBe("");
  });
});
