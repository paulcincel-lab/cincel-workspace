// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";

import type { ProjectSpace } from "@/lib/types/core";

const actions = vi.hoisted(() => ({
  createProjectSpaceAction: vi.fn(),
  renameProjectSpaceAction: vi.fn(),
  reorderProjectSpacesAction: vi.fn(),
  deleteProjectSpaceAction: vi.fn(),
}));
vi.mock("@/lib/actions/projects-actions", () => actions);

// Inline stand-in for the portal AlertDialog.
vi.mock("@/components/ui/shadcn/alert-dialog", () => {
  type P = { children?: React.ReactNode };
  const Pass = ({ children }: P) => <div>{children}</div>;
  return {
    AlertDialog: ({ open, children }: P & { open?: boolean }) => (open ? <div role="alertdialog">{children}</div> : null),
    AlertDialogContent: Pass,
    AlertDialogHeader: Pass,
    AlertDialogFooter: Pass,
    AlertDialogTitle: Pass,
    AlertDialogDescription: Pass,
    AlertDialogCancel: ({ children }: P) => <button type="button">{children}</button>,
    AlertDialogAction: ({ children, onClick, disabled }: P & { onClick?: () => void; disabled?: boolean }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
  };
});

import { ProjectSpacesCard } from "./ProjectSpacesCard";

function space(id: string, name: string, sortOrder: number, taskCount = 0): ProjectSpace {
  return { id, name, sortOrder, taskCount, projectId: "p1" };
}

const SPACES = [space("s2", "Planta baja", 1, 3), space("s1", "Depto 201", 0, 2)];

function rowNames() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelectorAll("td")[1]?.textContent);
}

describe("ProjectSpacesCard", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
  });
  afterEach(cleanup);

  it("shows the empty state", () => {
    render(<ProjectSpacesCard projectId="p1" initialSpaces={[]} canEdit />);
    expect(
      screen.getByText("Sin espacios. Agrega espacios como «Depto 201» o «Planta baja» para filtrar tareas.")
    ).toBeTruthy();
  });

  it("lists espacios by sortOrder with their task counts", () => {
    render(<ProjectSpacesCard projectId="p1" initialSpaces={SPACES} canEdit />);
    expect(rowNames()).toEqual(["Depto 201", "Planta baja"]);
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("adds an espacio at the end", async () => {
    actions.createProjectSpaceAction.mockResolvedValue(space("s3", "Azotea", 2));
    render(<ProjectSpacesCard projectId="p1" initialSpaces={SPACES} canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "+ Agregar espacio" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del espacio" }), { target: { value: "  Azotea " } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(rowNames()).toEqual(["Depto 201", "Planta baja", "Azotea"]));
    expect(actions.createProjectSpaceAction).toHaveBeenCalledWith("p1", "Azotea");
  });

  it("requires a name and maps NAME_TAKEN to Spanish copy", async () => {
    actions.createProjectSpaceAction.mockRejectedValue(new Error("NAME_TAKEN"));
    render(<ProjectSpacesCard projectId="p1" initialSpaces={SPACES} canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "+ Agregar espacio" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getByText("Escribe un nombre.")).toBeTruthy();
    expect(actions.createProjectSpaceAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del espacio" }), { target: { value: "Depto 201" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(await screen.findByText("Ya existe un espacio con ese nombre.")).toBeTruthy();
  });

  it("renames inline", async () => {
    actions.renameProjectSpaceAction.mockResolvedValue(space("s1", "Depto 202", 0, 2));
    render(<ProjectSpacesCard projectId="p1" initialSpaces={SPACES} canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "Renombrar Depto 201" }));
    const input = screen.getByRole("textbox", { name: "Nombre de Depto 201" });
    fireEvent.change(input, { target: { value: "Depto 202" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(rowNames()).toEqual(["Depto 202", "Planta baja"]));
    expect(actions.renameProjectSpaceAction).toHaveBeenCalledWith("s1", "Depto 202");
  });

  it("reorders by drag", async () => {
    actions.reorderProjectSpacesAction.mockResolvedValue(undefined);
    render(<ProjectSpacesCard projectId="p1" initialSpaces={SPACES} canEdit />);

    const grips = screen.getAllByTitle("Arrastra para reordenar");
    const target = screen.getByText("Planta baja").closest("tr")!;
    const dataTransfer = {};
    fireEvent.dragStart(grips[0], { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(actions.reorderProjectSpacesAction).toHaveBeenCalledWith("p1", ["s2", "s1"]));
    expect(rowNames()).toEqual(["Planta baja", "Depto 201"]);
  });

  it("deletes after confirming in the dialog", async () => {
    actions.deleteProjectSpaceAction.mockResolvedValue(undefined);
    render(<ProjectSpacesCard projectId="p1" initialSpaces={SPACES} canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Planta baja" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Las tareas de Planta baja quedarán sin espacio.");
    expect(actions.deleteProjectSpaceAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(rowNames()).toEqual(["Depto 201"]));
    expect(actions.deleteProjectSpaceAction).toHaveBeenCalledWith("s2");
  });

  it("is read-only without canEdit", () => {
    render(<ProjectSpacesCard projectId="p1" initialSpaces={SPACES} canEdit={false} />);

    expect(screen.queryByRole("button", { name: "+ Agregar espacio" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Eliminar / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Renombrar / })).toBeNull();
    expect(screen.queryAllByTitle("Arrastra para reordenar")).toHaveLength(0);
  });
});
