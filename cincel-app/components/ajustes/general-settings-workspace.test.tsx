// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

vi.mock("@/components/patterns/SettingsSection", async () => ({
  SettingsSection: (await import("./general-settings-test-utils")).TestSettingsSection,
}));
vi.mock("@/components/patterns/SettingsRow", async () => ({
  SettingsRow: (await import("./general-settings-test-utils")).TestSettingsRow,
}));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const actions = vi.hoisted(() => ({
  saveGeneralSettingsAction: vi.fn(),
  restoreGeneralSettingsAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({ getAjustesGeneralPageData: vi.fn() }));
vi.mock("@/lib/actions/app-settings-actions", () => actions);

import { AjustesGeneralClient } from "./AjustesGeneralClient";
import { GeneralLinksSection } from "./GeneralLinksSection";
import {
  buildDefaultGeneralSettings,
  buildDefaultLoadedGeneralSettings,
  formatGeneralSettingsSavedAt,
  type LoadedGeneralSettings,
} from "@/lib/settings/general-settings";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { CONTACT_EMAIL_ERROR, HTTPS_URL_ERROR } from "@/lib/settings/header-links";

const SAVED_AT = "2026-11-04T16:30:00.000Z";

let client: QueryClient;

/**
 * The page as it hydrates: `qk.org.general()` seeded by the root layout and
 * the capability flags by the page (`qk.ajustes.page('general')`).
 */
function renderPage(general: LoadedGeneralSettings = buildDefaultLoadedGeneralSettings()) {
  client = createTestQueryClient();
  client.setQueryData(qk.org.general(), general);
  client.setQueryData(qk.ajustes.page("general"), { canManage: true, canManageAppearance: false });
  return renderWithQueryClient(
    <AjustesGeneralClient>
      <GeneralLinksSection />
    </AjustesGeneralClient>,
    { client },
  );
}

function savedWithLinks(): LoadedGeneralSettings {
  const settings = buildDefaultGeneralSettings();
  settings.company.instagramUrl = "https://instagram.com/cincel";
  settings.company.contactEmail = "hola@cincel.mx";
  settings.company.website = "https://cincel.mx";
  return { settings, hasCustom: true, savedAt: SAVED_AT };
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: "Guardar cambios" });

describe("Ajustes › General", () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("renders the sections of the frame with the existing fields and the links", () => {
    renderPage(savedWithLinks());

    for (const title of ["Logo", "Organización", "Región y formatos", "Sistema", "Enlaces del despacho"]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(field("Nombre comercial").value).toBe("Cincel Workspace");
    expect(field("Instagram").value).toBe("https://instagram.com/cincel");
    expect(field("Sitio web").value).toBe("https://cincel.mx");
    expect(field("Correo").value).toBe("hola@cincel.mx");
    expect(screen.getByText(formatGeneralSettingsSavedAt(SAVED_AT))).toBeTruthy();
  });

  it("saves existing fields as today", async () => {
    actions.saveGeneralSettingsAction.mockResolvedValue({ savedAt: SAVED_AT });
    renderPage();

    fireEvent.change(field("Nombre comercial"), { target: { value: "Cincel Studio" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.getByText(formatGeneralSettingsSavedAt(SAVED_AT))).toBeTruthy());
    expect(actions.saveGeneralSettingsAction.mock.calls[0][0].company.tradeName).toBe("Cincel Studio");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("writes the saved settings into qk.org.general(), so every useGeneralSettings() reader updates", async () => {
    actions.saveGeneralSettingsAction.mockResolvedValue({ savedAt: SAVED_AT });
    renderPage();

    fireEvent.change(field("Nombre comercial"), { target: { value: "Cincel Studio" } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(client.getQueryData<LoadedGeneralSettings>(qk.org.general())).toMatchObject({
        hasCustom: true,
        savedAt: SAVED_AT,
        settings: { company: { tradeName: "Cincel Studio" } },
      }),
    );
    // Saved: the draft equals the cache again, so the button is off.
    await waitFor(() => expect(saveButton().hasAttribute("disabled")).toBe(true));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("validates the link fields inline and blocks the save while one is wrong", () => {
    renderPage();

    fireEvent.change(field("Instagram"), { target: { value: "instagram.com/cincel" } });
    fireEvent.change(field("Correo"), { target: { value: "hola@" } });
    fireEvent.change(field("Sitio web"), { target: { value: "http://cincel.mx" } });

    expect(screen.getAllByText(HTTPS_URL_ERROR)).toHaveLength(2);
    expect(screen.getByText(CONTACT_EMAIL_ERROR)).toBeTruthy();
    expect(field("Instagram").getAttribute("aria-invalid")).toBe("true");
    expect(field("Instagram").getAttribute("aria-describedby")).toBe("general-instagramUrl-error");
    expect(saveButton().hasAttribute("disabled")).toBe(true);
    fireEvent.click(saveButton());
    expect(actions.saveGeneralSettingsAction).not.toHaveBeenCalled();
  });

  it("persists valid links trimmed, and blanks as null", async () => {
    actions.saveGeneralSettingsAction.mockResolvedValue({ savedAt: SAVED_AT });
    renderPage(savedWithLinks());

    fireEvent.change(field("Instagram"), { target: { value: "  https://www.instagram.com/cincel.mx/  " } });
    fireEvent.change(field("Correo"), { target: { value: "   " } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(actions.saveGeneralSettingsAction).toHaveBeenCalledTimes(1));
    const company = actions.saveGeneralSettingsAction.mock.calls[0][0].company;
    expect(company.instagramUrl).toBe("https://www.instagram.com/cincel.mx/");
    expect(company.contactEmail).toBeNull();
    expect(company.website).toBe("https://cincel.mx");
  });

  it("restores the defaults, clearing the link fields", async () => {
    actions.restoreGeneralSettingsAction.mockResolvedValue(undefined);
    renderPage(savedWithLinks());

    fireEvent.click(screen.getByRole("button", { name: "Restaurar configuración por defecto" }));

    await waitFor(() => expect(field("Instagram").value).toBe(""));
    expect(actions.restoreGeneralSettingsAction).toHaveBeenCalledTimes(1);
    expect(field("Correo").value).toBe("");
    expect(field("Sitio web").value).toBe(buildDefaultGeneralSettings().company.website);
    expect(screen.queryByText(/^Guardado /)).toBeNull();
    expect(client.getQueryData(qk.org.general())).toEqual(buildDefaultLoadedGeneralSettings());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the error copy when the save fails", async () => {
    actions.saveGeneralSettingsAction.mockRejectedValue(new Error("FORBIDDEN"));
    renderPage();

    fireEvent.change(field("Nombre comercial"), { target: { value: "Cincel Studio" } });
    fireEvent.click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo guardar");
  });
});

describe("Ajustes › General and the retired browser copy of the header links", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("never reads cincel.header.links.v1: the fields come from the server only", () => {
    window.localStorage.setItem(
      "cincel.header.links.v1",
      JSON.stringify({ instagram: "https://www.instagram.com/cincel.mx/", website: "https://www.cincel.mx/", email: "hola@cincel.mx" }),
    );
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    renderPage();

    expect(field("Instagram").value).toBe("");
    expect(field("Correo").value).toBe("");
    expect(getItem.mock.calls.map(([key]) => key)).not.toContain("cincel.header.links.v1");
    expect(screen.queryByText(/Se cargaron los enlaces guardados en este navegador/)).toBeNull();
  });
});
