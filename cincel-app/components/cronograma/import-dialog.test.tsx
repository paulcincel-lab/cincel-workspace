import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

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
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

/** Renders the dialog and spies on the client's invalidations. */
function renderDialog(scheduleId: string | null = "s1") {
  const client = createTestQueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const result = renderWithQueryClient(<ImportDialog projectId="p1" scheduleId={scheduleId} />, { client });
  return { ...result, invalidatedKeys: () => invalidate.mock.calls.map(([filters]) => filters?.queryKey) };
}

const IMPORT_KEYS = [
  qk.proyectos.cronograma("p1"),
  qk.proyectos.resumen("p1"),
  qk.proyectos.list(),
  qk.proyectos.shell("p1"),
];

function makeFile(name = "cronograma.xlsx"): File {
  return new File(["contenido"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("ImportDialog", () => {
  it("opens and shows both tabs", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    expect(screen.getByText("Excel / CSV")).toBeTruthy();
    expect(screen.getByText("Respaldo JSON")).toBeTruthy();
  });

  it("previewing a file shows the diff summary without invalidating, then confirming commits and invalidates", async () => {
    previewImportScheduleAction.mockResolvedValue({
      ok: true,
      data: { keptCount: 300, newCount: 20, removedCount: 3, removedTasks: [{ stableKey: "PB-x", tarea: "Vieja" }] },
    });
    commitImportScheduleAction.mockResolvedValue({ ok: true, data: { keptCount: 300, newCount: 20, removedCount: 3, removedTasks: [] } });

    const { invalidatedKeys } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    await waitFor(() => expect(screen.getByText(/300 conservadas/)).toBeTruthy());
    expect(screen.getByText("Vieja")).toBeTruthy();
    // The preview is a read: no invalidation.
    expect(invalidatedKeys()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));
    await waitFor(() => expect(commitImportScheduleAction).toHaveBeenCalledWith("p1", expect.any(FormData)));
    await waitFor(() => expect(invalidatedKeys()).toEqual(IMPORT_KEYS));
  });

  it("shows an error when preview fails", async () => {
    previewImportScheduleAction.mockResolvedValue({ ok: false, error: "Faltan columnas requeridas." });
    const { invalidatedKeys } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    await waitFor(() => expect(screen.getByText("Faltan columnas requeridas.")).toBeTruthy());
    expect(invalidatedKeys()).toEqual([]);
  });

  it("shows the commit's error and invalidates on settle", async () => {
    previewImportScheduleAction.mockResolvedValue({
      ok: true,
      data: { keptCount: 1, newCount: 0, removedCount: 0, removedTasks: [] },
    });
    commitImportScheduleAction.mockResolvedValue({ ok: false, error: "No tienes permiso para editar este cronograma." });
    const { invalidatedKeys } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar importación" }));

    await waitFor(() => expect(screen.getByText("No tienes permiso para editar este cronograma.")).toBeTruthy());
    await waitFor(() => expect(invalidatedKeys()).toEqual(IMPORT_KEYS));
  });

  it("applying a legacy JSON shows the result and invalidates the import keys", async () => {
    importLegacyStateAction.mockResolvedValue({ ok: true, data: { matchedCount: 3, unmatchedKeys: [] } });
    const { invalidatedKeys } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    fireEvent.click(screen.getByText("Respaldo JSON"));

    fireEvent.change(screen.getByPlaceholderText(/"done"/), { target: { value: '{"done":{}}' } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(importLegacyStateAction).toHaveBeenCalledWith("s1", '{"done":{}}'));
    await waitFor(() => expect(screen.getByText("3 tareas actualizadas")).toBeTruthy());
    await waitFor(() => expect(invalidatedKeys()).toEqual(IMPORT_KEYS));
  });

  it("disables the legacy JSON tab content when there is no schedule yet", () => {
    renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    fireEvent.click(screen.getByText("Respaldo JSON"));
    expect(screen.getByText(/todavía no tiene un cronograma importado/)).toBeTruthy();
  });
});
