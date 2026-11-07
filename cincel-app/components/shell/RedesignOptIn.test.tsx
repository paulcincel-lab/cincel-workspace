import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { SessionAccessProvider } from "@/lib/auth/session-context";
import type { SessionAccess } from "@/lib/auth/session";
import { DEFAULT_USER_PREFERENCES } from "@/lib/ui/preferences";
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";
import type { OrgAppearance, UserPreferences } from "@/lib/types/redesign";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const flags = vi.hoisted(() => ({ IMPLEMENTED: { fetchMyPreferencesAction: true, updateMyPreferencesAction: true } }));
vi.mock("@/lib/actions/preferences-actions.flags", () => flags);

const updateMyPreferencesAction = vi.fn();
const fetchMyPreferencesAction = vi.fn<() => Promise<UserPreferences>>();
vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: (...args: unknown[]) => updateMyPreferencesAction(...args),
  fetchMyPreferencesAction: () => fetchMyPreferencesAction(),
}));

const fetchOrgAppearanceAction = vi.fn<() => Promise<OrgAppearance>>();
vi.mock("@/lib/actions/org-appearance-actions", () => ({
  fetchOrgAppearanceAction: () => fetchOrgAppearanceAction(),
}));

// The resolver's own rules are tested with it; here it only reports the flag.
vi.mock("@/lib/ui/preferences", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ui/preferences")>();
  return {
    ...actual,
    resolveAppearance: (org: OrgAppearance, user: UserPreferences | null) => ({
      ...actual.resolveAppearance(org, user),
      redesignEnabled: org.redesignAvailable && (user?.redesignEnabled ?? org.redesignDefault),
    }),
  };
});

import { RedesignOptInBanner, RedesignOptInEntry } from "./RedesignOptIn";

/** A non-admin staff session: opting in never needs an admin page or capability. */
const NON_ADMIN_SESSION = {
  status: "active",
  user: { id: "u-colab", name: "Ana Ruiz", email: "ana@cincel.mx", role: "Diseño", area: "Diseño", access: "Colaborador" },
} as unknown as SessionAccess;

function withSession(ui: ReactNode) {
  return <SessionAccessProvider value={NON_ADMIN_SESSION}>{ui}</SessionAccessProvider>;
}

const DISMISS_KEY = "cincel-redesign-banner-dismissed:u-colab";

beforeEach(() => {
  window.localStorage.clear();
  refresh.mockReset();
  updateMyPreferencesAction.mockReset();
  fetchMyPreferencesAction.mockReset();
  fetchOrgAppearanceAction.mockReset();
  flags.IMPLEMENTED.updateMyPreferencesAction = true;
  updateMyPreferencesAction.mockResolvedValue({ preferences: { ...DEFAULT_USER_PREFERENCES, redesignEnabled: true } });
  fetchMyPreferencesAction.mockResolvedValue({ ...DEFAULT_USER_PREFERENCES });
  fetchOrgAppearanceAction.mockResolvedValue({ ...DEFAULT_ORG_APPEARANCE, redesignAvailable: true, redesignDefault: false });
});

afterEach(() => {
  window.localStorage.clear();
});

describe("RedesignOptInBanner", () => {
  it("renders for a flag-off user", async () => {
    render(withSession(<RedesignOptInBanner userId="u-colab" visibility="available" />));
    expect(await screen.findByText("Prueba el nuevo diseño")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Activar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("can be dismissed and stays dismissed for that user", async () => {
    const { unmount } = render(withSession(<RedesignOptInBanner userId="u-colab" visibility="available" />));
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByText("Prueba el nuevo diseño")).toBeNull();
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe("1");
    unmount();

    render(withSession(<RedesignOptInBanner userId="u-colab" visibility="available" />));
    await act(async () => {});
    expect(screen.queryByText("Prueba el nuevo diseño")).toBeNull();
  });

  it("a dismissal by one user does not hide it for another", async () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    render(withSession(<RedesignOptInBanner userId="u-otro" visibility="available" />));
    expect(await screen.findByText("Prueba el nuevo diseño")).toBeTruthy();
  });

  it("Activar enables the flag and refreshes into the new shell", async () => {
    render(withSession(<RedesignOptInBanner userId="u-colab" visibility="available" />));
    fireEvent.click(await screen.findByRole("button", { name: "Activar" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(updateMyPreferencesAction).toHaveBeenCalledWith({ redesignEnabled: true });
  });

  it("shows the redesign opt-in copy on DISABLED and does not refresh", async () => {
    updateMyPreferencesAction.mockRejectedValue(new Error("DISABLED"));
    render(withSession(<RedesignOptInBanner userId="u-colab" visibility="available" />));
    fireEvent.click(await screen.findByRole("button", { name: "Activar" }));
    expect(await screen.findByText("El nuevo diseño no está disponible por ahora.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Activar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not render for flag-on users or while the kill switch is off", async () => {
    const { rerender } = render(withSession(<RedesignOptInBanner userId="u-colab" visibility="hidden" />));
    await act(async () => {});
    expect(screen.queryByText("Prueba el nuevo diseño")).toBeNull();
    rerender(withSession(<RedesignOptInBanner userId="u-colab" visibility="unavailable" />));
    await act(async () => {});
    expect(screen.queryByText("Prueba el nuevo diseño")).toBeNull();
  });
});

describe("RedesignOptInEntry", () => {
  it("renders for a flag-off user and opts in", async () => {
    render(withSession(<RedesignOptInEntry />));
    fireEvent.click(await screen.findByRole("button", { name: "Probar el nuevo diseño" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(updateMyPreferencesAction).toHaveBeenCalledWith({ redesignEnabled: true });
  });

  it("is hidden for flag-on users", async () => {
    fetchMyPreferencesAction.mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, redesignEnabled: true });
    render(withSession(<RedesignOptInEntry />));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Probar el nuevo diseño" })).toBeNull();
  });

  it("is disabled with the redesign opt-in copy when the kill switch is off", async () => {
    fetchOrgAppearanceAction.mockResolvedValue({ ...DEFAULT_ORG_APPEARANCE, redesignAvailable: false });
    render(withSession(<RedesignOptInEntry />));
    expect(await screen.findByText("El nuevo diseño no está disponible por ahora.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Probar el nuevo diseño" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the redesign opt-in copy when the write answers DISABLED", async () => {
    updateMyPreferencesAction.mockRejectedValue(new Error("DISABLED"));
    render(withSession(<RedesignOptInEntry />));
    fireEvent.click(await screen.findByRole("button", { name: "Probar el nuevo diseño" }));
    expect(await screen.findByText("El nuevo diseño no está disponible por ahora.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Probar el nuevo diseño" }) as HTMLButtonElement).disabled).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stays hidden while the opt-in write is not implemented", async () => {
    flags.IMPLEMENTED.updateMyPreferencesAction = false;
    render(withSession(<RedesignOptInEntry />));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Probar el nuevo diseño" })).toBeNull();
    expect(fetchOrgAppearanceAction).not.toHaveBeenCalled();
  });
});

describe("legacy shell files", () => {
  it("the opt-in does not live in the legacy Sidebar or Header", () => {
    for (const file of ["components/layout/Sidebar.tsx", "components/layout/Header.tsx"]) {
      const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
      expect(source).not.toContain("RedesignOptIn");
    }
  });
});
