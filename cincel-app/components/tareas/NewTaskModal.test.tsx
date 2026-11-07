// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import NewTaskModal from "./NewTaskModal";

const projects = [
  { id: "p-1", name: "Casa Roble" },
  { id: "p-2", name: "Torre Norte" },
];
const staff = [{ id: "s-1", name: "Ana López" }];
const phases = [
  { id: "f-1", name: "Anteproyecto", sortOrder: 1 },
  { id: "f-2", name: "Ejecutivo", sortOrder: 2 },
];
const spacesByProject = {
  "p-2": [
    { id: "e-1", name: "Depto 201" },
    { id: "e-2", name: "Planta baja" },
  ],
};

afterEach(cleanup);

function renderModal(overrides: Partial<ComponentProps<typeof NewTaskModal>> = {}) {
  const onSave = vi.fn();
  render(
    <NewTaskModal
      open
      projects={projects}
      staff={staff}
      phases={phases}
      spacesByProject={spacesByProject}
      onClose={vi.fn()}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onSave };
}

async function pick(trigger: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: trigger }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("NewTaskModal", () => {
  it("lists only the tramo's fases, defaults to the first one, and has no free-text option", async () => {
    renderModal();
    const trigger = screen.getByRole("combobox", { name: "Fase" });
    expect(trigger.textContent).toContain("Anteproyecto");

    fireEvent.click(trigger);
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Anteproyecto", "Ejecutivo"]);
    expect(screen.queryByText("Otro...")).toBeNull();
  });

  it("hides the Espacio select when the selected project has no espacios", () => {
    renderModal();
    expect(screen.queryByRole("combobox", { name: "Espacio" })).toBeNull();
  });

  it("shows the Espacio select when the project has espacios, starting at Sin espacio", async () => {
    renderModal();
    await pick("Proyecto", "Torre Norte");

    const trigger = await screen.findByRole("combobox", { name: "Espacio" });
    expect(trigger.textContent).toContain("Sin espacio");
  });

  it("saves the chosen fase and espacio ids", async () => {
    const { onSave } = renderModal({ projects: [projects[1]] });
    fireEvent.change(screen.getByPlaceholderText("Describe la tarea..."), { target: { value: "Planos de conjunto" } });
    await pick("Fase", "Ejecutivo");
    await pick("Espacio", "Depto 201");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p-2", phaseId: "f-2", spaceId: "e-1", title: "Planos de conjunto" }),
    );
  });

  it("resets the espacio when the project changes", async () => {
    const { onSave } = renderModal({ projects: [projects[1], projects[0]] });
    await pick("Espacio", "Planta baja");
    await pick("Proyecto", "Casa Roble");
    expect(screen.queryByRole("combobox", { name: "Espacio" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Describe la tarea..."), { target: { value: "Tarea" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p-1", spaceId: null }));
  });

  it("admin mode hides Fase and Espacio and saves no fase", () => {
    const { onSave } = renderModal({ mode: "admin", projects: [projects[1]] });
    expect(screen.getByText("Nueva tarea de administración")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Fase" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Espacio" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Describe la tarea..."), { target: { value: "Asignar cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ phaseId: null, spaceId: null }));
  });
});
