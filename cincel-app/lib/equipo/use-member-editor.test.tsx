// @vitest-environment happy-dom
/**
 * `useMemberEditor` (Query Migration 6): a save is one `saveMemberAction`
 * call with the whole editor input, the Personas keys are invalidated after
 * it, and a failure shows the form copy instead of a toast.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { GOOGLE_MANAGED_ERROR } from "@/lib/types/workspace-access";

const actions = vi.hoisted(() => ({ saveMemberAction: vi.fn(), fetchStaffDetailAction: vi.fn() }));
vi.mock("@/lib/actions/staff-actions", () => actions);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { memberSaveErrorText, useMemberEditor } from "./use-member-editor";

const ADMIN = {
  member: { id: "00000000-0000-4000-8000-0000000000aa", name: "Ana" },
  email: "ana@cincel.mx",
  access: "Administrador",
} as unknown as AuthenticatedUser;

function setup(client = createTestQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useMemberEditor({ authenticatedUser: ADMIN }), { wrapper });
  return { ...hook, client };
}

function fillNewMember(result: ReturnType<typeof setup>["result"]) {
  act(() => result.current.openAddEditor());
  act(() =>
    result.current.setDraft((d) => ({
      ...d,
      name: " Bruno ",
      lastName: "Soto",
      institutionalEmail: "Bruno@Cincel.mx",
      systemAccessEnabled: true,
      temporaryPassword: "temporal-123",
      temporaryPasswordConfirmation: "temporal-123",
      positionIds: ["00000000-0000-4000-8000-0000000000p1"],
      nationality: "Mexicana",
    })),
  );
}

beforeEach(() => {
  actions.saveMemberAction.mockReset();
  toast.error.mockReset();
});

describe("useMemberEditor", () => {
  it("saves a new member with one action call carrying the whole input", async () => {
    actions.saveMemberAction.mockResolvedValue({ ok: true, data: { id: "s-new", name: "Bruno" } });
    const { result } = setup();
    fillNewMember(result);
    act(() => result.current.saveMember());

    await waitFor(() => expect(result.current.showEditor).toBe(false));
    expect(actions.saveMemberAction).toHaveBeenCalledTimes(1);
    expect(actions.saveMemberAction.mock.calls[0]![0]).toEqual({
      staffId: null,
      staff: {
        name: "Bruno",
        lastName: "Soto",
        role: "Colaborador",
        email: "bruno@cincel.mx",
        phone: null,
        capacity: 8,
        availability: "Disponible",
      },
      profile: expect.objectContaining({ nationality: "Mexicana", curp: null }),
      positionIds: ["00000000-0000-4000-8000-0000000000p1"],
      credential: { enableAccess: true, temporaryPassword: "temporal-123" },
    });
    expect(result.current.formError).toBe("");
  });

  it("invalidates the Personas, catalog and permisos keys after the save", async () => {
    const client = createTestQueryClient();
    for (const key of [
      qk.personas.equipo(),
      qk.personas.counts(),
      qk.personas.detail("s-new"),
      qk.catalog.staff(),
      qk.catalog.assignableStaff("w1"),
      qk.ajustes.page("permisos"),
    ]) {
      client.setQueryData(key, []);
    }
    actions.saveMemberAction.mockResolvedValue({ ok: true, data: { id: "s-new", name: "Bruno" } });
    const { result } = setup(client);
    fillNewMember(result);
    act(() => result.current.saveMember());
    await waitFor(() => expect(client.getQueryState(qk.personas.equipo())?.isInvalidated).toBe(true));
    expect(client.getQueryState(qk.personas.counts())?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.personas.detail("s-new"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.catalog.staff())?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.catalog.assignableStaff("w1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.ajustes.page("permisos"))?.isInvalidated).toBe(true);
  });

  it("validates before calling the action", () => {
    const { result } = setup();
    act(() => result.current.openAddEditor());
    act(() => result.current.saveMember());
    expect(result.current.formError).toBe("Completa nombre y una capacidad válida.");
    expect(actions.saveMemberAction).not.toHaveBeenCalled();
  });

  it.each([
    [GOOGLE_MANAGED_ERROR, GOOGLE_MANAGED_ERROR],
    ["NOT_FOUND: position", "Ya no existe. Recarga la página."],
    ["FORBIDDEN: staff create", "No tienes permiso para realizar esta acción."],
  ])("shows %s as form copy, keeps the editor open and shows no toast", async (error, copy) => {
    actions.saveMemberAction.mockResolvedValue({ ok: false, error });
    const { result } = setup();
    fillNewMember(result);
    act(() => result.current.saveMember());
    await waitFor(() => expect(result.current.formError).toBe(copy));
    expect(result.current.showEditor).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("gives a stripped production error the editor's own copy", async () => {
    const stripped = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "123" });
    actions.saveMemberAction.mockRejectedValue(stripped);
    const { result } = setup();
    fillNewMember(result);
    act(() => result.current.saveMember());
    await waitFor(() => expect(result.current.formError).toBe("No se pudo guardar el colaborador."));
  });
});

describe("memberSaveErrorText", () => {
  it("passes the Google refusal through and maps codes", () => {
    expect(memberSaveErrorText(new Error(GOOGLE_MANAGED_ERROR))).toBe(GOOGLE_MANAGED_ERROR);
    expect(memberSaveErrorText(new Error("INVALID: staff.email"))).toBe(
      "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.",
    );
    expect(memberSaveErrorText(new TypeError("Failed to fetch"))).toBe("No se pudo guardar el colaborador.");
  });
});
