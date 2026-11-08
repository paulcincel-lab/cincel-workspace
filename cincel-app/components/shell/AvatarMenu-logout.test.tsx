// @vitest-environment happy-dom
/**
 * Logout from the rewritten `AvatarMenu` still runs `resetClientState` (plan
 * §4.8 rule 1): the real session store sees the identity change, so the query
 * cache of viewer A is emptied and the UI stores go back to their initial
 * state before viewer B signs in.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), logout: vi.fn(async () => undefined) }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: state.refresh, push: state.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/auth/auth-actions", () => ({ logoutAction: () => state.logout() }));
vi.mock("@/lib/actions/profile-photo-actions", () => ({ removeMyPhotoAction: vi.fn() }));
vi.mock("@/lib/settings/use-general-settings", async () => {
  const { buildDefaultGeneralSettings } = await import("@/lib/settings/general-settings");
  return { useGeneralSettings: () => buildDefaultGeneralSettings() };
});

import type { SessionAccess } from "@/lib/auth/session";
import { qk } from "@/lib/query/keys";
import { setBrowserQueryClient } from "@/lib/query/reset-client-state";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetSessionStoreForTests, useSessionStore } from "@/lib/stores/session-store";
import { useShellUi } from "@/lib/stores/shell-ui-store";

import { AvatarMenu } from "./AvatarMenu";

function active(id: string, name: string): SessionAccess {
  return {
    status: "active",
    user: {
      id,
      name,
      email: `${id}@cincel.mx`,
      role: "Diseño",
      area: null,
      active: true,
      mustChangePassword: false,
      googleLinked: true,
      access: "Colaborador",
    },
  };
}

afterEach(() => {
  cleanup();
  setBrowserQueryClient(null);
  resetSessionStoreForTests();
});

describe("AvatarMenu logout", () => {
  it("empties the query cache and the shell UI store; viewer B starts from an empty cache", async () => {
    const client = createTestQueryClient();
    setBrowserQueryClient(client);
    // The hydrator seeds viewer A: the baseline, nothing is cleared yet.
    useSessionStore.getState().setAccess(active("a", "Ana López"));
    client.setQueryData(qk.shell.badges(), { tareasOpen: 4, bandeja: { unreadCount: 2, dueReminders: [] } });
    useShellUi.getState().setSearchAvailable(true);
    useShellUi.getState().openSearch();

    renderWithQueryClient(<AvatarMenu session={{ staffId: "a", name: "Ana López", role: "Diseño", isAdmin: false, photoUrl: null }} />, {
      client,
    });
    fireEvent.click(screen.getByRole("button", { name: "Menú de la cuenta de Ana López" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cerrar sesión" }));

    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login"));
    expect(state.logout).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().access.status).toBe("guest");
    expect(client.getQueryCache().find({ queryKey: qk.shell.badges() })).toBeUndefined();
    expect(useShellUi.getState()).toMatchObject({ searchOpen: false, searchAvailable: false });

    // Viewer B signs in: nothing of A is left to show.
    useSessionStore.getState().setAccess(active("b", "Bruno Soto"));
    expect(client.getQueryData(qk.shell.badges())).toBeUndefined();
  });
});
