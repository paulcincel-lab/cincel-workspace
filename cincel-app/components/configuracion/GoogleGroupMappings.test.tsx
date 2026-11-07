// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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

const POSITION_ID = "00000000-0000-4000-8000-000000000001";
const roleMapping: GroupMapping = {
  id: "00000000-0000-4000-8000-0000000000a1",
  groupEmail: "cincel-direccion@example.test",
  kind: "role",
  role: "Dirección",
  positionId: null,
  positionName: null,
  rank: 70,
};
const positionMapping: GroupMapping = {
  id: "00000000-0000-4000-8000-0000000000a2",
  groupEmail: "cincel-diseno@example.test",
  kind: "position",
  role: null,
  positionId: POSITION_ID,
  positionName: "Diseñador",
  rank: 0,
};

function renderMappings(mappings: GroupMapping[] = [roleMapping, positionMapping]) {
  return render(<GoogleGroupMappings mappings={mappings} positions={[{ id: POSITION_ID, name: "Diseñador" }]} />);
}

async function openRowMenu(groupEmail: string, label: string) {
  const row = screen.getByText(groupEmail).closest("tr") as HTMLElement;
  fireEvent.click(within(row).getByLabelText("Acciones"));
  fireEvent.click(await screen.findByText(label));
}

describe("GoogleGroupMappings", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
    router.refresh.mockReset();
  });
  afterEach(cleanup);

  it("lists mappings with grupo, tipo, valor and rango", () => {
    renderMappings();
    const roleRow = screen.getByText(roleMapping.groupEmail).closest("tr") as HTMLElement;
    expect(within(roleRow).getByText("Rol")).toBeTruthy();
    expect(within(roleRow).getByText("Dirección")).toBeTruthy();
    expect(within(roleRow).getByText("70")).toBeTruthy();
    const positionRow = screen.getByText(positionMapping.groupEmail).closest("tr") as HTMLElement;
    expect(within(positionRow).getByText("Puesto")).toBeTruthy();
    expect(within(positionRow).getByText("Diseñador")).toBeTruthy();
  });

  it("adds a role group from the Agregar grupo sheet", async () => {
    actions.createGroupMappingAction.mockResolvedValue({ ok: true, mapping: roleMapping });
    renderMappings([]);

    fireEvent.click(screen.getByRole("button", { name: "Agregar grupo" }));
    fireEvent.change(await screen.findByLabelText("Correo del grupo"), {
      target: { value: "cincel-admins@example.test" },
    });
    fireEvent.click(screen.getByText("Elige un rol"));
    // happy-dom only commits a click on the first option of a base-ui Select.
    fireEvent.click(await screen.findByText("Administrador"));
    fireEvent.change(screen.getByLabelText("Rango"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
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
    renderMappings();

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

  it("edits a position mapping, keeping its puesto", async () => {
    actions.updateGroupMappingAction.mockResolvedValue({ ok: true, mapping: positionMapping });
    renderMappings();

    await openRowMenu(positionMapping.groupEmail, "Editar");
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.updateGroupMappingAction).toHaveBeenCalledWith(positionMapping.id, {
      groupEmail: positionMapping.groupEmail,
      kind: "position",
      role: null,
      positionId: POSITION_ID,
      rank: 0,
    });
  });

  it("deletes only after confirming in the dialog", async () => {
    actions.deleteGroupMappingAction.mockResolvedValue({ ok: true });
    renderMappings();

    await openRowMenu(roleMapping.groupEmail, "Eliminar");
    expect(await screen.findByText("¿Eliminar este grupo?")).toBeTruthy();
    expect(actions.deleteGroupMappingAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(actions.deleteGroupMappingAction).toHaveBeenCalledWith(roleMapping.id));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("cancelling the dialog deletes nothing", async () => {
    renderMappings();

    await openRowMenu(roleMapping.groupEmail, "Eliminar");
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByText("¿Eliminar este grupo?")).toBeNull());
    expect(actions.deleteGroupMappingAction).not.toHaveBeenCalled();
  });
});
