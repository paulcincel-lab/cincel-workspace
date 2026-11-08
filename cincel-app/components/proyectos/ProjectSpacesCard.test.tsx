// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type * as React from "react";

import type { ProjectSpace } from "@/lib/types/core";

const actions = vi.hoisted(() => ({
  createProjectSpaceAction: vi.fn(),
  renameProjectSpaceAction: vi.fn(),
  reorderProjectSpacesAction: vi.fn(),
  deleteProjectSpaceAction: vi.fn(),
}));
vi.mock("@/lib/actions/projects-actions", () => actions);
/** The card reads the seeded cache: any catalog fetch is a bug. */
const catalog = vi.hoisted(() => ({ fetchCatalogProjectSpaces: vi.fn() }));
vi.mock("@/lib/actions/page-data/catalog-actions", () => catalog);

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

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

import { ProjectSpacesCard } from "./ProjectSpacesCard";

function space(id: string, name: string, sortOrder: number, taskCount = 0): ProjectSpace {
  return { id, name, sortOrder, taskCount, projectId: "p1" };
}

const SPACES = [space("s2", "Planta baja", 1, 3), space("s1", "Depto 201", 0, 2)];
const SPACES_KEY = qk.catalog.projectSpaces("p1");

function rowNames() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelectorAll("td")[1]?.textContent);
}

/** An action result that resolves when the test says so, to look at the optimistic state first. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Renders the card over a cache seeded with `spaces`, as the ficha query leaves it. */
function renderCard(spaces: ProjectSpace[], canEdit = true) {
  const client = createTestQueryClient();
  client.setQueryData(SPACES_KEY, spaces);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const result = renderWithQueryClient(<ProjectSpacesCard projectId="p1" canEdit={canEdit} />, { client });
  const invalidated = () => invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
  return { ...result, client, invalidated };
}

describe("ProjectSpacesCard", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
  });
  afterEach(cleanup);

  it("shows the empty state", () => {
    renderCard([]);
    expect(
      screen.getByText("Sin espacios. Agrega espacios como «Depto 201» o «Planta baja» para filtrar tareas.")
    ).toBeTruthy();
  });

  it("lists espacios by sortOrder with their task counts, from catalog.projectSpaces(id)", () => {
    renderCard(SPACES);
    expect(rowNames()).toEqual(["Depto 201", "Planta baja"]);
    expect(screen.getByText("3")).toBeTruthy();
    expect(catalog.fetchCatalogProjectSpaces).not.toHaveBeenCalled();
  });

  it("adds an espacio at the end at once, then keeps the saved row", async () => {
    const save = deferred<{ ok: true; data: ProjectSpace }>();
    actions.createProjectSpaceAction.mockReturnValue(save.promise);
    const { client, invalidated } = renderCard(SPACES);

    fireEvent.click(screen.getByRole("button", { name: "+ Agregar espacio" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del espacio" }), { target: { value: "  Azotea " } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    // Optimistic: the row shows before the action answers.
    await waitFor(() => expect(rowNames()).toEqual(["Depto 201", "Planta baja", "Azotea"]));
    expect(actions.createProjectSpaceAction).toHaveBeenCalledWith("p1", "Azotea");

    save.resolve({ ok: true, data: space("s3", "Azotea", 2) });
    await waitFor(() =>
      expect(client.getQueryData<ProjectSpace[]>(SPACES_KEY)?.map((r) => r.id)).toEqual(["s2", "s1", "s3"]),
    );
    await waitFor(() =>
      expect(invalidated()).toEqual([
        qk.proyectos.tab("p1", "ficha"),
        qk.proyectos.resumen("p1"),
        qk.catalog.projectOptions(),
      ]),
    );
  });

  it("requires a name, and rolls a failed add back with the NAME_TAKEN copy", async () => {
    actions.createProjectSpaceAction.mockResolvedValue({ ok: false, error: "NAME_TAKEN" });
    renderCard(SPACES);

    fireEvent.click(screen.getByRole("button", { name: "+ Agregar espacio" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getByText("Escribe un nombre.")).toBeTruthy();
    expect(actions.createProjectSpaceAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del espacio" }), { target: { value: "Depto 201" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(await screen.findByText("Ya existe un espacio con ese nombre.")).toBeTruthy();
    expect(rowNames()).toEqual(["Depto 201", "Planta baja"]);
  });

  it("renames inline at once", async () => {
    const save = deferred<{ ok: true; data: ProjectSpace }>();
    actions.renameProjectSpaceAction.mockReturnValue(save.promise);
    const { invalidated } = renderCard(SPACES);

    fireEvent.click(screen.getByRole("button", { name: "Renombrar Depto 201" }));
    const input = screen.getByRole("textbox", { name: "Nombre de Depto 201" });
    fireEvent.change(input, { target: { value: "Depto 202" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(rowNames()).toEqual(["Depto 202", "Planta baja"]));
    expect(actions.renameProjectSpaceAction).toHaveBeenCalledWith("s1", "Depto 202");

    save.resolve({ ok: true, data: space("s1", "Depto 202", 0, 2) });
    await waitFor(() =>
      expect(invalidated()).toEqual([
        qk.proyectos.tab("p1", "ficha"),
        qk.proyectos.resumen("p1"),
        qk.catalog.projectOptions(),
      ]),
    );
  });

  it("rolls a failed rename back and shows the error", async () => {
    actions.renameProjectSpaceAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    renderCard(SPACES);

    fireEvent.click(screen.getByRole("button", { name: "Renombrar Depto 201" }));
    const input = screen.getByRole("textbox", { name: "Nombre de Depto 201" });
    fireEvent.change(input, { target: { value: "Depto 202" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
    expect(rowNames()).toEqual(["Depto 201", "Planta baja"]);
  });

  it("reorders by drag", async () => {
    actions.reorderProjectSpacesAction.mockResolvedValue({ ok: true, data: undefined });
    renderCard(SPACES);

    const grips = screen.getAllByTitle("Arrastra para reordenar");
    const target = screen.getByText("Planta baja").closest("tr")!;
    const dataTransfer = {};
    fireEvent.dragStart(grips[0], { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(actions.reorderProjectSpacesAction).toHaveBeenCalledWith("p1", ["s2", "s1"]));
    expect(rowNames()).toEqual(["Planta baja", "Depto 201"]);
  });

  it("deletes after confirming in the dialog, at once, and invalidates Tareas too", async () => {
    const save = deferred<{ ok: true; data: undefined }>();
    actions.deleteProjectSpaceAction.mockReturnValue(save.promise);
    const { invalidated } = renderCard(SPACES);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Planta baja" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Las tareas de Planta baja quedarán sin espacio.");
    expect(actions.deleteProjectSpaceAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(rowNames()).toEqual(["Depto 201"]));
    expect(actions.deleteProjectSpaceAction).toHaveBeenCalledWith("s2");

    save.resolve({ ok: true, data: undefined });
    await waitFor(() =>
      expect(invalidated()).toEqual([qk.proyectos.tab("p1", "ficha"), qk.proyectos.resumen("p1"), qk.tareas.all]),
    );
  });

  it("rolls a failed delete back", async () => {
    actions.deleteProjectSpaceAction.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    renderCard(SPACES);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Planta baja" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText("Ya no existe. Recarga la página.")).toBeTruthy();
    expect(rowNames()).toEqual(["Depto 201", "Planta baja"]);
  });

  it("is read-only without canEdit", () => {
    renderCard(SPACES, false);

    expect(screen.queryByRole("button", { name: "+ Agregar espacio" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Eliminar / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Renombrar / })).toBeNull();
    expect(screen.queryAllByTitle("Arrastra para reordenar")).toHaveLength(0);
  });
});
