import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProjectCreateModal } from "./ProjectCreateModal";

afterEach(() => {
  cleanup();
});

describe("ProjectCreateModal", () => {
  it("asks only for the name, with no Etapa inicial or other fields", () => {
    render(<ProjectCreateModal onClose={vi.fn()} onConfirm={vi.fn()} presaleAutoStart />);
    expect(screen.getByLabelText("Nombre del proyecto")).toBeTruthy();
    expect(screen.queryByText("Etapa inicial")).toBeNull();
    expect(screen.queryByText("Cliente")).toBeNull();
    expect(screen.queryByText("Encargado")).toBeNull();
    expect(screen.queryByText("Fecha de inicio")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("mentions the Presale auto-start only when it is on", () => {
    const { unmount } = render(<ProjectCreateModal onClose={vi.fn()} onConfirm={vi.fn()} presaleAutoStart />);
    expect(screen.getByText("Solo necesitas el nombre. Presale se inicia automáticamente.")).toBeTruthy();
    unmount();
    render(<ProjectCreateModal onClose={vi.fn()} onConfirm={vi.fn()} presaleAutoStart={false} />);
    expect(screen.getByText("Solo necesitas el nombre.")).toBeTruthy();
    expect(screen.queryByText(/Presale se inicia/)).toBeNull();
  });

  it("requires a name and describes the field with the error", () => {
    const onConfirm = vi.fn();
    render(<ProjectCreateModal onClose={vi.fn()} onConfirm={onConfirm} presaleAutoStart />);
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    expect(onConfirm).not.toHaveBeenCalled();
    const input = screen.getByLabelText("Nombre del proyecto");
    const error = screen.getByText("El nombre del proyecto es obligatorio.");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("sends only the trimmed name", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ProjectCreateModal onClose={vi.fn()} onConfirm={onConfirm} presaleAutoStart />);
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "  Casa Lomas  " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ name: "Casa Lomas" }));
  });

  it("maps NAME_TAKEN to inline copy", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("NAME_TAKEN"));
    render(<ProjectCreateModal onClose={vi.fn()} onConfirm={onConfirm} presaleAutoStart />);
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "Casa Lomas" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    expect(await screen.findByText("Ya existe un proyecto con ese nombre.")).toBeTruthy();
  });
});
