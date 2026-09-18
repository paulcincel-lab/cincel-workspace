import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const addImprevistoAction = vi.fn();
const deleteImprevistoAction = vi.fn();

vi.mock("@/lib/actions/schedule-actions", () => ({
  addImprevistoAction: (...args: unknown[]) => addImprevistoAction(...args),
  deleteImprevistoAction: (...args: unknown[]) => deleteImprevistoAction(...args),
}));

import { ImprevistosPanel } from "./imprevistos-panel";

describe("ImprevistosPanel", () => {
  it("renders existing imprevistos newest first", () => {
    render(
      <ImprevistosPanel
        scheduleId="s1"
        imprevistos={[
          { id: "1", fecha: "2026-07-01", texto: "Primero" },
          { id: "2", fecha: "2026-07-15", texto: "Segundo" },
        ]}
      />
    );
    const texts = screen.getAllByText(/Primero|Segundo/).map((el) => el.textContent);
    expect(texts).toEqual(["Segundo", "Primero"]);
  });

  it("adding an imprevisto calls the server action and shows it optimistically", async () => {
    addImprevistoAction.mockResolvedValue({ ok: true, data: { id: "new-1", fecha: "2026-08-01", texto: "Nuevo trabajo" } });
    render(<ImprevistosPanel scheduleId="s1" imprevistos={[]} />);

    fireEvent.change(screen.getByPlaceholderText(/Describe el trabajo/), { target: { value: "Nuevo trabajo" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(addImprevistoAction).toHaveBeenCalledWith("s1", expect.objectContaining({ texto: "Nuevo trabajo" })));
    await waitFor(() => expect(screen.getByText("Nuevo trabajo")).toBeTruthy());
  });

  it("shows an error banner when the add action fails", async () => {
    addImprevistoAction.mockResolvedValue({ ok: false, error: "Fecha inválida." });
    render(<ImprevistosPanel scheduleId="s1" imprevistos={[]} />);

    fireEvent.change(screen.getByPlaceholderText(/Describe el trabajo/), { target: { value: "Algo" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.getByText("Fecha inválida.")).toBeTruthy());
  });

  it("readOnly hides the add form and delete controls", () => {
    render(<ImprevistosPanel scheduleId="s1" imprevistos={[{ id: "1", fecha: "2026-07-01", texto: "Algo" }]} readOnly />);
    expect(screen.queryByRole("button", { name: "Agregar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  });
});
