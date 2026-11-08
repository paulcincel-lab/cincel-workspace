import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const addImprevistoAction = vi.fn();
const deleteImprevistoAction = vi.fn();
const getProyectoCronogramaData = vi.fn();

vi.mock("@/lib/actions/schedule-actions", () => ({
  addImprevistoAction: (...args: unknown[]) => addImprevistoAction(...args),
  deleteImprevistoAction: (...args: unknown[]) => deleteImprevistoAction(...args),
}));

// The confirm dialog renders inline: its action is the only "Eliminar" button.
vi.mock("@/components/ui/shadcn/alert-dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: Pass,
    AlertDialogContent: Pass,
    AlertDialogHeader: Pass,
    AlertDialogFooter: Pass,
    AlertDialogTitle: Pass,
    AlertDialogDescription: Pass,
    AlertDialogTrigger: () => null,
    AlertDialogCancel: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
    AlertDialogAction: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  };
});

vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoCronogramaData: (...args: unknown[]) => getProyectoCronogramaData(...args),
}));

import { ImprevistosPanel } from "./imprevistos-panel";
import type { ScheduleViewData } from "@/lib/actions/schedule-actions";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { Imprevisto } from "@/lib/types/schedule";

const KEY = qk.proyectos.cronograma("p1");

function viewWith(imprevistos: Imprevisto[]): ScheduleViewData {
  return {
    data: {
      project: { id: "p1", name: "Proyecto", address: null },
      schedule: { id: "s1", version: 1, paymentCalendarLabel: null },
      tasks: [],
      payments: [],
      imprevistos,
      adicionales: [],
    },
    today: "2026-09-18",
  };
}

function renderPanel(imprevistos: Imprevisto[], readOnly = false) {
  const client = createTestQueryClient();
  client.setQueryData(KEY, viewWith(imprevistos));
  return renderWithQueryClient(<ImprevistosPanel projectId="p1" readOnly={readOnly} />, { client });
}

const cachedIds = (client: ReturnType<typeof createTestQueryClient>) =>
  client.getQueryData<ScheduleViewData>(KEY)!.data.imprevistos.map((i) => i.id);

function addText(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/Describe el trabajo/), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
}

/** Confirms the row's delete dialog. */
function confirmDelete() {
  fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("ImprevistosPanel", () => {
  it("renders the cached imprevistos newest first", () => {
    renderPanel([
      { id: "1", fecha: "2026-07-01", texto: "Primero" },
      { id: "2", fecha: "2026-07-15", texto: "Segundo" },
    ]);
    const texts = screen.getAllByText(/Primero|Segundo/).map((el) => el.textContent);
    expect(texts).toEqual(["Segundo", "Primero"]);
    expect(getProyectoCronogramaData).not.toHaveBeenCalled();
  });

  it("adding shows the row at once, then swaps in the saved one: one POST, no refetch", async () => {
    let resolve!: (value: unknown) => void;
    addImprevistoAction.mockReturnValue(new Promise((r) => (resolve = r)));
    const { client } = renderPanel([]);

    addText("Nuevo trabajo");

    // Optimistic: in the list (and the cache) before the server answers.
    await waitFor(() => expect(screen.getByText("Nuevo trabajo")).toBeTruthy());
    expect(cachedIds(client)[0]).toMatch(/^optimistic-/);
    expect(addImprevistoAction).toHaveBeenCalledWith("s1", expect.objectContaining({ texto: "Nuevo trabajo" }));

    resolve({ ok: true, data: { id: "new-1", fecha: "2026-08-01", texto: "Nuevo trabajo" } });
    await waitFor(() => expect(client.isMutating()).toBe(0));

    expect(cachedIds(client)).toEqual(["new-1"]);
    expect(screen.getByText("Nuevo trabajo")).toBeTruthy();
    expect(addImprevistoAction).toHaveBeenCalledTimes(1);
    expect(getProyectoCronogramaData).not.toHaveBeenCalled();
    // The schedule is marked stale for the next reader.
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it("takes the added row back and shows the error when the add fails", async () => {
    addImprevistoAction.mockResolvedValue({ ok: false, error: "Fecha inválida." });
    const { client } = renderPanel([]);

    addText("Algo");

    await waitFor(() => expect(screen.getByText("Fecha inválida.")).toBeTruthy());
    await waitFor(() => expect(cachedIds(client)).toEqual([]));
  });

  it("deleting removes the row at once: one POST, no refetch", async () => {
    deleteImprevistoAction.mockResolvedValue({ ok: true, data: { id: "1" } });
    const { client } = renderPanel([{ id: "1", fecha: "2026-07-01", texto: "Para borrar" }]);

    confirmDelete();

    await waitFor(() => expect(deleteImprevistoAction).toHaveBeenCalledWith("1"));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(cachedIds(client)).toEqual([]);
    expect(deleteImprevistoAction).toHaveBeenCalledTimes(1);
    expect(getProyectoCronogramaData).not.toHaveBeenCalled();
  });

  it("puts the row back and shows the error when the delete fails", async () => {
    deleteImprevistoAction.mockResolvedValue({ ok: false, error: "No encontrado." });
    const { client } = renderPanel([{ id: "1", fecha: "2026-07-01", texto: "Se queda" }]);

    confirmDelete();

    await waitFor(() => expect(screen.getByText("No encontrado.")).toBeTruthy());
    expect(cachedIds(client)).toEqual(["1"]);
    expect(screen.getByText("Se queda")).toBeTruthy();
  });

  it("readOnly hides the add form and delete controls", () => {
    renderPanel([{ id: "1", fecha: "2026-07-01", texto: "Algo" }], true);
    expect(screen.queryByRole("button", { name: "Agregar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  });
});
