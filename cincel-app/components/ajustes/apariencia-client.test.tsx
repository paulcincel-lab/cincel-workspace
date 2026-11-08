// @vitest-environment happy-dom
/**
 * Ajustes › Apariencia on the `useAppearance` store (Query Migration 9a,
 * #963): the page has no copy of the preferences; every change is
 * optimistic in the store, rolls back only the failed fields with the inline
 * error, `OVERRIDE_DISABLED` locks Tema and Estilo, and the text size is
 * debounced once (in the store). The org data is the hydrated
 * `qk.ajustes.page('apariencia')`.
 */
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { qk } from "@/lib/query/keys";
import { setBrowserQueryClient } from "@/lib/query/reset-client-state";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { AjustesAparienciaPageData } from "@/lib/query/options/ajustes";
import {
  AppearanceStoreProvider,
  OVERRIDE_LOCKED_COPY,
  TEXT_SIZE_DEBOUNCE_MS,
} from "@/lib/stores/appearance-store";
import type { OrgAppearance, ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";
import { DEFAULT_USER_PREFERENCES, resolveAppearance } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  pageData: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: mocks.update,
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({
  getAjustesAparienciaPageData: mocks.pageData,
  getAjustesNotificacionesPageData: vi.fn(),
  getAjustesPerfilPageData: vi.fn(),
  getAjustesIntegracionesPageData: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

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

import { useStyle } from "@/components/shell/StyleProvider";

import { AparienciaClient, toTextSize } from "./AparienciaClient";

const ORG: OrgAppearance = { ...THEME_PRESETS.azul, allowUserOverride: true, styleDefault: "visual" };
const PREFS: UserPreferences = { ...DEFAULT_USER_PREFERENCES };
const INVALID_COPY = "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.";

function appearanceFor(org: OrgAppearance, prefs: UserPreferences): ResolvedAppearance {
  return resolveAppearance({ ...org, v: 1 }, prefs);
}

/** The action's success result for a patch on top of `PREFS`. */
function saved(patch: Partial<UserPreferences>) {
  const preferences = { ...PREFS, ...patch };
  return { ok: true, data: { preferences, appearance: appearanceFor(ORG, preferences) } };
}

function renderClient(overrides: { org?: Partial<OrgAppearance>; prefs?: Partial<UserPreferences>; isAdmin?: boolean } = {}) {
  const org = { ...ORG, ...overrides.org };
  const prefs = { ...PREFS, ...overrides.prefs };
  const client = createTestQueryClient();
  client.setQueryData<AjustesAparienciaPageData>(qk.ajustes.page("apariencia"), {
    org,
    isAdmin: overrides.isAdmin ?? false,
    overridesAllowed: org.allowUserOverride,
  });
  setBrowserQueryClient(client);
  return renderWithQueryClient(
    <AppearanceStoreProvider initial={appearanceFor(org, prefs)} preferences={prefs} fixedByOrg={!org.allowUserOverride}>
      <AparienciaClient />
    </AppearanceStoreProvider>,
    { client },
  );
}

function radio(name: string) {
  return screen.getByRole("radio", { name });
}

beforeEach(() => {
  mocks.update.mockReset();
  mocks.update.mockImplementation(async (patch: Partial<UserPreferences>) => saved(patch));
  mocks.pageData.mockReset();
  mocks.toastError.mockReset();
});

afterEach(() => {
  cleanup();
  setBrowserQueryClient(null);
  vi.useRealTimers();
});

describe("AparienciaClient", () => {
  it("applies a theme change optimistically before the action answers", async () => {
    mocks.update.mockReturnValue(new Promise(() => {}));
    renderClient();
    expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(radio("Cálido"));

    expect(mocks.update).toHaveBeenCalledWith({ theme: "calido" });
    await waitFor(() => expect(radio("Cálido").getAttribute("aria-checked")).toBe("true"));
    expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("false");
  });

  it("rolls back only the failed field and shows the error inline, without a toast", async () => {
    renderClient();
    fireEvent.click(radio("Oscuro"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ mode: "dark" }));
    await waitFor(() => expect(radio("Oscuro").getAttribute("aria-checked")).toBe("true"));

    mocks.update.mockResolvedValueOnce({ ok: false, error: "INVALID: theme" });
    fireEvent.click(radio("Grafito"));

    await waitFor(() => expect(screen.getByText(INVALID_COPY)).toBeTruthy());
    expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("true");
    expect(radio("Grafito").getAttribute("aria-checked")).toBe("false");
    // The earlier, saved mode stays.
    expect(radio("Oscuro").getAttribute("aria-checked")).toBe("true");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("clears a section's inline error on its next change", async () => {
    mocks.update.mockResolvedValueOnce({ ok: false, error: "INVALID: density" });
    renderClient();
    fireEvent.click(radio("Compacta"));
    await waitFor(() => expect(screen.getByText(INVALID_COPY)).toBeTruthy());

    fireEvent.click(radio("Compacta"));
    await waitFor(() => expect(screen.queryByText(INVALID_COPY)).toBeNull());
  });

  it("writes the saved preferences into me.preferences", async () => {
    const { client } = renderClient();
    fireEvent.click(radio("Compacta"));
    await waitFor(() =>
      expect(client.getQueryData<UserPreferences>(qk.me.preferences())).toEqual({ ...PREFS, density: "compacta" }),
    );
  });

  it("follows the organization (null) when the user picks the org theme or style", async () => {
    // The server keeps the stored preferences: each answer is the previous state plus the patch.
    let stored: UserPreferences = { ...PREFS, theme: "calido", style: "analitico" };
    mocks.update.mockImplementation(async (patch: Partial<UserPreferences>) => {
      stored = { ...stored, ...patch };
      return { ok: true, data: { preferences: stored, appearance: appearanceFor(ORG, stored) } };
    });
    renderClient({ prefs: { theme: "calido", style: "analitico" } });

    fireEvent.click(radio("Azul Cincel"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ theme: null }));

    fireEvent.click(radio("Visual"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ style: null }));
  });

  it("marks the organization theme with the badge and notes its name", () => {
    renderClient();
    expect(screen.getByText("Organización")).toBeTruthy();
    expect(screen.getByText("El tema de la organización es Azul Cincel. Puedes usar otro solo para ti.")).toBeTruthy();
  });

  it("disables the Tema and Estilo cards with the organization copy when overrides are off", async () => {
    renderClient({ org: { allowUserOverride: false }, prefs: { theme: "grafito", style: "esencial" } });

    expect(screen.getAllByText(OVERRIDE_LOCKED_COPY)).toHaveLength(2);
    // The org values show, not the stored personal ones.
    expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("true");
    expect(radio("Visual").getAttribute("aria-checked")).toBe("true");
    for (const name of ["Azul Cincel", "Cálido", "Grafito", "Visual", "Esencial", "Analítico"]) {
      expect(radio(name).hasAttribute("data-disabled")).toBe(true);
    }

    fireEvent.click(radio("Cálido"));
    fireEvent.click(radio("Analítico"));
    expect(mocks.update).not.toHaveBeenCalled();

    // Modo and Densidad stay personal.
    fireEvent.click(radio("Oscuro"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ mode: "dark" }));
  });

  it("locks the cards when the action answers OVERRIDE_DISABLED", async () => {
    mocks.update.mockResolvedValueOnce({ ok: false, error: "OVERRIDE_DISABLED" });
    renderClient();

    fireEvent.click(radio("Cálido"));

    await waitFor(() => expect(screen.getAllByText(OVERRIDE_LOCKED_COPY)).toHaveLength(2));
    expect(radio("Azul Cincel").getAttribute("aria-checked")).toBe("true");
    expect(radio("Cálido").hasAttribute("data-disabled")).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();
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

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ theme: "calido" }));
    expect(document.activeElement).toBe(radio("Cálido"));
  });

  it("selects a mode with Space", async () => {
    renderClient();
    const oscuro = radio("Oscuro");
    act(() => oscuro.focus());

    fireEvent.keyDown(oscuro, { key: " " });
    fireEvent.keyUp(oscuro, { key: " " });

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ mode: "dark" }));
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(radio("Oscuro").getAttribute("aria-checked")).toBe("true");
  });

  it("changes density right away and writes <html data-density>", async () => {
    renderClient();
    fireEvent.click(radio("Compacta"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ density: "compacta" }));
    expect(radio("Compacta").getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(document.documentElement.getAttribute("data-density")).toBe("compacta"));
  });

  it("debounces the text size slider once, in the store, into one action call", async () => {
    vi.useFakeTimers();
    renderClient();
    const slider = screen.getByRole("slider", { name: "Tamaño de texto" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });

    // The preview follows the slider at once.
    expect((screen.getByTestId("apariencia-preview-body") as HTMLElement).style.fontSize).toBe("15.5px");
    expect(mocks.update).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TEXT_SIZE_DEBOUNCE_MS - 1);
    });
    expect(mocks.update).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ textSize: 15.5 });
  });

  it("makes no client page-data call on mount (the data is hydrated)", () => {
    renderClient();
    expect(mocks.pageData).not.toHaveBeenCalled();
  });

  it("snaps text sizes to 13–16 in steps of 0.5", () => {
    expect(toTextSize(12)).toBe(13);
    expect(toTextSize(14.26)).toBe(14.5);
    expect(toTextSize(14.2)).toBe(14);
    expect(toTextSize(17)).toBe(16);
  });

  it("has no switch back to the old design", () => {
    renderClient();
    expect(screen.queryByRole("switch", { name: /diseño/i })).toBeNull();
    expect(screen.queryByText("Nuevo diseño")).toBeNull();
  });
});

describe("Apariencia → useStyle()", () => {
  function StyleReader() {
    const { style } = useStyle();
    return <p data-testid="next-page-style">{style}</p>;
  }

  it("a style set on Apariencia is what another tree's useStyle() and <html data-style> read, without a reload", async () => {
    const client = createTestQueryClient();
    client.setQueryData<AjustesAparienciaPageData>(qk.ajustes.page("apariencia"), {
      org: ORG,
      isAdmin: false,
      overridesAllowed: true,
    });
    setBrowserQueryClient(client);
    renderWithQueryClient(
      <AppearanceStoreProvider initial={appearanceFor(ORG, PREFS)} preferences={PREFS}>
        <AparienciaClient />
        {/* Another page of the same session reads the same root store. */}
        <section aria-label="Siguiente página">
          <StyleReader />
        </section>
      </AppearanceStoreProvider>,
      { client },
    );
    expect(screen.getByTestId("next-page-style").textContent).toBe("visual");

    fireEvent.click(radio("Analítico"));

    await waitFor(() => expect(screen.getByTestId("next-page-style").textContent).toBe("analitico"));
    await waitFor(() => expect(document.documentElement.getAttribute("data-style")).toBe("analitico"));
    expect(mocks.update).toHaveBeenCalledWith({ style: "analitico" });
  });
});
