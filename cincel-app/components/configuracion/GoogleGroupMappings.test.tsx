// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { GroupMapping } from "@/lib/types/workspace-access";

const actions = vi.hoisted(() => ({
  createGroupMappingAction: vi.fn(),
  updateGroupMappingAction: vi.fn(),
  deleteGroupMappingAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/lib/actions/workspace-access-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { GoogleGroupMappings } from "./GoogleGroupMappings";

/** A real mouse press on a base-ui Select option: pointerdown, then click (base-ui ignores a bare click). */
function pressOption(option: HTMLElement) {
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

const POSITION_ID = "00000000-0000-4000-8000-000000000001";
const roleMapping: GroupMapping = {
  id: "00000000-0000-4000-8000-0000000000a1",
  groupEmail: "cincel-direccion@example.test",
  kind: "role",
  role: "Dirección",
  positionId: null,
  positionName: null,
  rank: 70,
  memberCount: 8,
  exists: true,
};
const positionMapping: GroupMapping = {
  id: "00000000-0000-4000-8000-0000000000a2",
  groupEmail: "cincel-diseno@example.test",
  kind: "position",
  role: null,
  positionId: POSITION_ID,
  positionName: "Diseñador",
  rank: 0,
  memberCount: null,
  exists: false,
};

let invalidate: ReturnType<typeof vi.fn>;

function render(ui: ReactElement) {
  const client = createTestQueryClient();
  invalidate = vi.fn(client.invalidateQueries.bind(client));
  client.invalidateQueries = invalidate as typeof client.invalidateQueries;
  return renderWithQueryClient(ui, { client });
}

function renderMappings(mappings: GroupMapping[] = [roleMapping, positionMapping]) {
  return render(<GoogleGroupMappings mappings={mappings} positions={[{ id: POSITION_ID, name: "Diseñador" }]} />);
}

/** A mapping change refreshes Google, Puestos and the staff catalog through the cache, never the route. */
function expectMappingInvalidations() {
  for (const queryKey of [qk.ajustes.page("google"), qk.ajustes.page("puestos"), qk.catalog.staff()]) {
    expect(invalidate).toHaveBeenCalledWith({ queryKey });
  }
  expect(router.refresh).not.toHaveBeenCalled();
}

/** "Editar {correo}" opens the sheet; "Eliminar" is "Eliminar grupo" in that sheet, then the confirmation. */
async function openRowMenu(groupEmail: string, label: "Editar" | "Eliminar") {
  fireEvent.click(screen.getByRole("button", { name: `Editar ${groupEmail}` }));
  if (label === "Eliminar") fireEvent.click(await screen.findByRole("button", { name: "Eliminar grupo" }));
}

function addButton() {
  return screen.getAllByRole("button", { name: "Agregar grupo" })[0]!;
}

describe("GoogleGroupMappings", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
    router.refresh.mockReset();
  });
  afterEach(cleanup);

  it("lists mappings with correo, tipo, rango, puesto and miembros", () => {
    renderMappings();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Correo del grupo",
      "Tipo",
      "Rango",
      "Puesto",
      "Miembros",
      "Acciones",
    ]);
    const roleRow = screen.getByText(roleMapping.groupEmail).closest("tr") as HTMLElement;
    expect(within(roleRow).getByText("Rol")).toBeTruthy();
    expect(within(roleRow).getByText("Dirección")).toBeTruthy();
    expect(within(roleRow).getByText("8")).toBeTruthy();
    const positionRow = screen.getByText(positionMapping.groupEmail).closest("tr") as HTMLElement;
    expect(within(positionRow).getByText("Puesto")).toBeTruthy();
    expect(within(positionRow).getByText("Diseñador")).toBeTruthy();
    expect(within(positionRow).getByText("El grupo no existe")).toBeTruthy();
  });

  it("shows the empty state with Agregar grupo", () => {
    renderMappings([]);
    expect(screen.getByText("Aún no hay grupos.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Agregar grupo" }).length).toBeGreaterThan(0);
  });

  it("adds a role group from the Agregar grupo sheet", async () => {
    actions.createGroupMappingAction.mockResolvedValue({ ok: true, mapping: roleMapping });
    renderMappings([]);

    fireEvent.click(addButton());
    fireEvent.change(await screen.findByLabelText("Correo del grupo"), {
      target: { value: "cincel-admins@example.test" },
    });
    fireEvent.click(screen.getByText("Elige un rol"));
    // happy-dom only commits a click on the first option of a base-ui Select.
    fireEvent.click(await screen.findByText("Administrador"));
    fireEvent.change(screen.getByLabelText("Rango"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expectMappingInvalidations());
    expect(actions.createGroupMappingAction).toHaveBeenCalledWith({
      groupEmail: "cincel-admins@example.test",
      kind: "role",
      role: "Administrador",
      positionId: null,
      rank: 80,
    });
  });

  it('shows "El grupo no existe" when Google does not find the group', async () => {
    actions.updateGroupMappingAction.mockResolvedValue({ ok: false, error: "group_not_found" });
    renderMappings([roleMapping]);

    await openRowMenu(roleMapping.groupEmail, "Editar");
    const email = await screen.findByLabelText("Correo del grupo");
    expect((email as HTMLInputElement).value).toBe(roleMapping.groupEmail);
    fireEvent.change(email, { target: { value: "no-existe@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El grupo no existe")).toBeTruthy();
    expect(actions.updateGroupMappingAction).toHaveBeenCalledWith(roleMapping.id, {
      groupEmail: "no-existe@example.test",
      kind: "role",
      role: "Dirección",
      positionId: null,
      rank: 70,
    });
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("edits a puesto mapping, keeping its puesto", async () => {
    actions.updateGroupMappingAction.mockResolvedValue({ ok: true, mapping: positionMapping });
    renderMappings();

    await openRowMenu(positionMapping.groupEmail, "Editar");
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));

    await waitFor(() => expectMappingInvalidations());
    expect(actions.updateGroupMappingAction).toHaveBeenCalledWith(positionMapping.id, {
      groupEmail: positionMapping.groupEmail,
      kind: "position",
      role: null,
      positionId: POSITION_ID,
      rank: 0,
    });
  });

  it("offers Rol and Puesto as the kinds", async () => {
    renderMappings([]);

    fireEvent.click(addButton());
    fireEvent.click(await screen.findByLabelText("Tipo"));
    expect(await screen.findByRole("option", { name: "Puesto" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Rol" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Área" })).toBeNull();
  });

  it("changes the puesto of a puesto mapping from the Puesto select", async () => {
    const OTHER_ID = "00000000-0000-4000-8000-000000000002";
    actions.updateGroupMappingAction.mockResolvedValue({ ok: true, mapping: positionMapping });
    render(
      <GoogleGroupMappings
        mappings={[positionMapping]}
        positions={[
          { id: OTHER_ID, name: "Arquitecto" },
          { id: POSITION_ID, name: "Diseñador" },
        ]}
      />,
    );

    await openRowMenu(positionMapping.groupEmail, "Editar");
    fireEvent.click(await screen.findByLabelText("Puesto"));
    pressOption(await screen.findByRole("option", { name: "Arquitecto" }));
    expect(screen.queryByLabelText("Rango")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expectMappingInvalidations());
    expect(actions.updateGroupMappingAction).toHaveBeenCalledWith(positionMapping.id, {
      groupEmail: positionMapping.groupEmail,
      kind: "position",
      role: null,
      positionId: OTHER_ID,
      rank: 0,
    });
  });

  it("deletes only after confirming in the dialog", async () => {
    actions.deleteGroupMappingAction.mockResolvedValue({ ok: true });
    renderMappings();

    await openRowMenu(roleMapping.groupEmail, "Eliminar");
    expect(await screen.findByText("¿Eliminar este grupo?")).toBeTruthy();
    expect(actions.deleteGroupMappingAction).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(actions.deleteGroupMappingAction).toHaveBeenCalledWith(roleMapping.id));
    await waitFor(() => expectMappingInvalidations());
  });

  it("cancelling the dialog deletes nothing", async () => {
    renderMappings();

    await openRowMenu(roleMapping.groupEmail, "Eliminar");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByText("¿Eliminar este grupo?")).toBeNull());
    expect(actions.deleteGroupMappingAction).not.toHaveBeenCalled();
  });
});
