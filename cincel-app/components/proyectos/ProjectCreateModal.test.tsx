// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProjectCreateModal } from "./ProjectCreateModal";

afterEach(() => {
  cleanup();
});

function renderModal(onConfirm = vi.fn().mockResolvedValue(undefined), presaleAutoStart = true) {
  render(<ProjectCreateModal onClose={vi.fn()} onConfirm={onConfirm} presaleAutoStart={presaleAutoStart} />);
  return onConfirm;
}

describe("ProjectCreateModal", () => {
  it("has a single name field and submits the trimmed name only", async () => {
    const onConfirm = renderModal();

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("combobox")).toBeNull();

    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "  Casa Lomas  " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ name: "Casa Lomas" }));
  });

  it("describes Presale auto-start only when it is on", () => {
    renderModal(undefined, true);
    expect(screen.getByText("Solo necesitas el nombre. Presale se inicia automáticamente.")).toBeTruthy();
    cleanup();

    renderModal(undefined, false);
    expect(screen.getByText("Solo necesitas el nombre.")).toBeTruthy();
    expect(screen.queryByText(/Presale se inicia/)).toBeNull();
  });

  it("shows the empty-name copy inline without calling onConfirm", async () => {
    const onConfirm = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    const message = await screen.findByText("El nombre del proyecto es obligatorio.");
    const input = screen.getByLabelText("Nombre del proyecto");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("maps NAME_TAKEN to its copy under the field", async () => {
    renderModal(vi.fn().mockRejectedValue(new Error("NAME_TAKEN")));

    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "Casa Lomas" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));

    const message = await screen.findByText("Ya existe un proyecto con ese nombre.");
    expect(screen.getByLabelText("Nombre del proyecto").getAttribute("aria-describedby")).toBe(message.id);
    expect(screen.getByRole("button", { name: "Crear proyecto" }).hasAttribute("disabled")).toBe(false);
  });

  it("submits with Enter from the name field", async () => {
    const onConfirm = renderModal();
    const input = screen.getByLabelText("Nombre del proyecto");
    fireEvent.change(input, { target: { value: "Depto Roma" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ name: "Depto Roma" }));
  });
});
