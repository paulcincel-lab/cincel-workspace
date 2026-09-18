import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

// Base UI's Dialog/Tabs portals don't finish their exit animation in happy-dom
// (no animationend/transitionend fires), so a dialog left open at a test's
// end can leave stale portalled nodes in document.body past RTL's normal
// cleanup — force a hard reset between tests in this file to avoid it.
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const previewImportScheduleAction = vi.fn();
const commitImportScheduleAction = vi.fn();
const importLegacyStateAction = vi.fn();

vi.mock("@/lib/actions/schedule-actions", () => ({
  previewImportScheduleAction: (...args: unknown[]) => previewImportScheduleAction(...args),
  commitImportScheduleAction: (...args: unknown[]) => commitImportScheduleAction(...args),
  importLegacyStateAction: (...args: unknown[]) => importLegacyStateAction(...args),
}));

import { ImportDialog } from "./import-dialog";

function makeFile(name = "cronograma.xlsx"): File {
  return new File(["contenido"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("ImportDialog", () => {
  it("opens and shows both tabs", () => {
    render(<ImportDialog projectId="p1" scheduleId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    expect(screen.getByText("Excel / CSV")).toBeTruthy();
    expect(screen.getByText("Respaldo JSON")).toBeTruthy();
  });

  it("previewing a file shows the diff summary, then confirming commits it", async () => {
    previewImportScheduleAction.mockResolvedValue({
      ok: true,
      data: { keptCount: 300, newCount: 20, removedCount: 3, removedTasks: [{ stableKey: "PB-x", tarea: "Vieja" }] },
    });
    commitImportScheduleAction.mockResolvedValue({ ok: true, data: { keptCount: 300, newCount: 20, removedCount: 3, removedTasks: [] } });

    const onImported = vi.fn();
    render(<ImportDialog projectId="p1" scheduleId="s1" onImported={onImported} />);
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    await waitFor(() => expect(screen.getByText(/300 conservadas/)).toBeTruthy());
    expect(screen.getByText("Vieja")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));
    await waitFor(() => expect(commitImportScheduleAction).toHaveBeenCalled());
    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it("shows an error when preview fails", async () => {
    previewImportScheduleAction.mockResolvedValue({ ok: false, error: "Faltan columnas requeridas." });
    render(<ImportDialog projectId="p1" scheduleId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    await waitFor(() => expect(screen.getByText("Faltan columnas requeridas.")).toBeTruthy());
  });

  it("disables the legacy JSON tab content when there is no schedule yet", () => {
    render(<ImportDialog projectId="p1" scheduleId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    fireEvent.click(screen.getByText("Respaldo JSON"));
    expect(screen.getByText(/todavía no tiene un cronograma importado/)).toBeTruthy();
  });
});
