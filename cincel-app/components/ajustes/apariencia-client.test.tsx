// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrgAppearance, UserPreferences } from "@/lib/types/redesign";
import { DEFAULT_USER_PREFERENCES } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

const setPreference = vi.fn<(patch: Partial<UserPreferences>) => Promise<void>>();
const refresh = vi.fn();

vi.mock("@/components/shell/AppearanceProvider", () => ({
  useAppearance: () => ({ appearance: null, setPreference }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

// The shared settings patterns render plain markup here so the page can be exercised on its own.
vi.mock("@/components/patterns/SettingsSection", () => ({
  SettingsSection: ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));
vi.mock("@/components/patterns/SettingsRow", () => ({
  SettingsRow: ({ label, description, control, htmlFor }: { label: string; description?: string; control: ReactNode; htmlFor?: string }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {description ? <p>{description}</p> : null}
      {control}
    </div>
  ),
}));

import { AparienciaClient, toTextSize } from "./AparienciaClient";
import { TEXT_SIZE_DEBOUNCE_MS } from "./apariencia-context";

const ORG: OrgAppearance = { ...THEME_PRESETS.azul, allowUserOverride: true, redesignAvailable: true, styleDefault: "visual" };
const PREFS: UserPreferences = { ...DEFAULT_USER_PREFERENCES, redesignEnabled: true };

function renderClient(overrides: { org?: Partial<OrgAppearance>; prefs?: Partial<UserPreferences>; isAdmin?: boolean } = {}) {
  return render(
    <AparienciaClient
      preferences={{ ...PREFS, ...overrides.prefs }}
      org={{ ...ORG, ...overrides.org }}
      isAdmin={overrides.isAdmin ?? false}
    />,
  );
}

function radio(name: string) {
  return screen.getByRole("radio", { name });
}

beforeEach(() => {
  setPreference.mockReset();
  setPreference.mockResolvedValue(undefined);
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AparienciaClient", () => {
  it("applies a theme change optimistically before the action answers", async () => {
    setPreference.mockReturnValue(new Promise(() => {}));
    renderClient();
    expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(radio("Cálido"));

    expect(setPreference).toHaveBeenCalledWith({ theme: "calido" });
    await waitFor(() => expect(radio("Cálido").getAttribute("aria-checked")).toBe("true"));
    expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("false");
  });

  it("rolls back and shows the action error copy when the change fails", async () => {
    setPreference.mockRejectedValue(new Error("INVALID: theme"));
    renderClient();

    fireEvent.click(radio("Grafito"));

    await waitFor(() => expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("true"));
    expect(radio("Grafito").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.")).toBeTruthy();
  });

  it("follows the organization (null) when the user picks the org theme or style", async () => {
    renderClient({ prefs: { theme: "calido", style: "analitico" } });

    fireEvent.click(radio("Azul Cincel"));
    await waitFor(() => expect(setPreference).toHaveBeenCalledWith({ theme: null }));

    fireEvent.click(radio("Visual"));
    await waitFor(() => expect(setPreference).toHaveBeenCalledWith({ style: null }));
  });

  it("marks the organization theme with the badge and notes its name", () => {
    renderClient();
    expect(screen.getByText("Organización")).toBeTruthy();
    expect(screen.getByText("El tema de la organización es Azul Cincel. Puedes usar otro solo para ti.")).toBeTruthy();
  });

  it("disables the Tema and Estilo cards with the organization copy when overrides are off", () => {
    renderClient({ org: { allowUserOverride: false }, prefs: { theme: "grafito", style: "esencial" } });

    expect(screen.getAllByText("La organización fijó el tema y el estilo.")).toHaveLength(2);
    // The org values show, not the stored personal ones.
    expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("true");
    expect(radio("Visual").getAttribute("aria-checked")).toBe("true");
    for (const name of ["Azul Cincel", "Cálido", "Grafito", "Visual", "Esencial", "Analítico"]) {
      expect(radio(name).hasAttribute("data-disabled")).toBe(true);
    }

    fireEvent.click(radio("Cálido"));
    fireEvent.click(radio("Analítico"));
    expect(setPreference).not.toHaveBeenCalled();

    // Modo and Densidad stay personal.
    fireEvent.click(radio("Oscuro"));
    expect(setPreference).toHaveBeenCalledWith({ mode: "dark" });
  });

  it("locks the cards when the action answers OVERRIDE_DISABLED", async () => {
    setPreference.mockRejectedValue(new Error("OVERRIDE_DISABLED"));
    renderClient();

    fireEvent.click(radio("Cálido"));

    await waitFor(() => expect(screen.getAllByText("La organización fijó el tema y el estilo.")).toHaveLength(2));
    expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("true");
    expect(radio("Cálido").hasAttribute("data-disabled")).toBe(true);
  });

  it("shows the edit link to /ajustes/tema only for admins", () => {
    const { unmount } = renderClient({ isAdmin: false });
    expect(screen.queryByRole("link", { name: "Editar tema de la organización" })).toBeNull();
    unmount();

    renderClient({ isAdmin: true });
    expect(screen.getByRole("link", { name: "Editar tema de la organización" }).getAttribute("href")).toBe("/ajustes/tema");
  });

  it("moves between theme cards with the arrow keys", async () => {
    renderClient();
    const azul = radio("Azul Cincel");
    act(() => azul.focus());

    fireEvent.keyDown(azul, { key: "ArrowRight" });

    await waitFor(() => expect(setPreference).toHaveBeenCalledWith({ theme: "calido" }));
    expect(document.activeElement).toBe(radio("Cálido"));
  });

  it("selects a mode with Space", async () => {
    renderClient();
    const oscuro = radio("Oscuro");
    act(() => oscuro.focus());

    fireEvent.keyDown(oscuro, { key: " " });
    fireEvent.keyUp(oscuro, { key: " " });

    await waitFor(() => expect(setPreference).toHaveBeenCalledWith({ mode: "dark" }));
    expect(setPreference).toHaveBeenCalledTimes(1);
    expect(radio("Oscuro").getAttribute("aria-checked")).toBe("true");
  });

  it("changes density right away", async () => {
    renderClient();
    fireEvent.click(radio("Compacta"));
    await waitFor(() => expect(setPreference).toHaveBeenCalledWith({ density: "compacta" }));
    expect(radio("Compacta").getAttribute("aria-checked")).toBe("true");
  });

  it("debounces the text size slider into one action call", async () => {
    vi.useFakeTimers();
    renderClient();
    const slider = screen.getByRole("slider", { name: "Tamaño de texto" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });

    // The preview follows the slider at once.
    expect((screen.getByTestId("apariencia-preview-body") as HTMLElement).style.fontSize).toBe("15.5px");
    expect(setPreference).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TEXT_SIZE_DEBOUNCE_MS - 1);
    });
    expect(setPreference).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(setPreference).toHaveBeenCalledTimes(1);
    expect(setPreference).toHaveBeenCalledWith({ textSize: 15.5 });
  });

  it("snaps text sizes to 13–16 in steps of 0.5", () => {
    expect(toTextSize(12)).toBe(13);
    expect(toTextSize(14.26)).toBe(14.5);
    expect(toTextSize(14.2)).toBe(14);
    expect(toTextSize(17)).toBe(16);
  });

  it("toggles the new design and refreshes the page", async () => {
    renderClient();
    const toggle = screen.getByRole("switch", { name: "Probar el nuevo diseño" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);

    await waitFor(() => expect(setPreference).toHaveBeenCalledWith({ redesignEnabled: false }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("keeps the new design switch off and disabled when the organization turned it off", () => {
    renderClient({ org: { redesignAvailable: false } });
    const toggle = screen.getByRole("switch", { name: "Probar el nuevo diseño" });

    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.hasAttribute("data-disabled")).toBe(true);
    expect(screen.getByText("El nuevo diseño no está disponible por ahora.")).toBeTruthy();

    fireEvent.click(toggle);
    expect(setPreference).not.toHaveBeenCalled();
  });

  it("does not enable the new design when the action answers DISABLED", async () => {
    setPreference.mockRejectedValue(new Error("DISABLED"));
    renderClient({ prefs: { redesignEnabled: false } });
    const toggle = screen.getByRole("switch", { name: "Probar el nuevo diseño" });

    fireEvent.click(toggle);

    await waitFor(() => expect(screen.getAllByText("El nuevo diseño no está disponible por ahora.").length).toBeGreaterThan(0));
    expect(screen.getByRole("switch", { name: "Probar el nuevo diseño" }).getAttribute("aria-checked")).toBe("false");
    expect(refresh).not.toHaveBeenCalled();
  });
});
