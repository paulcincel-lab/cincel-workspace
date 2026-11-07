// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
vi.mock("@/lib/actions/app-settings-actions", () => actions);

import { AjustesGeneralClient } from "./AjustesGeneralClient";
import { GeneralLinksSection } from "./GeneralLinksSection";
import {
  buildDefaultGeneralSettings,
  buildDefaultLoadedGeneralSettings,
  formatGeneralSettingsSavedAt,
  type LoadedGeneralSettings,
} from "@/lib/settings/general-settings";
import {
  CONTACT_EMAIL_ERROR,
  HEADER_LINKS_MIGRATED_STORAGE_KEY,
  HTTPS_URL_ERROR,
  LEGACY_HEADER_LINKS_STORAGE_KEY,
} from "@/lib/settings/header-links-migration";

const SAVED_AT = "2026-11-04T16:30:00.000Z";

function renderPage(general: LoadedGeneralSettings = buildDefaultLoadedGeneralSettings()) {
  return render(
    <AjustesGeneralClient general={general} canManage canManageAppearance={false}>
      <GeneralLinksSection />
    </AjustesGeneralClient>,
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
    expect(refresh).toHaveBeenCalled();
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
  });

  it("shows the error copy when the save fails", async () => {
    actions.saveGeneralSettingsAction.mockRejectedValue(new Error("FORBIDDEN"));
    renderPage();

    fireEvent.change(field("Nombre comercial"), { target: { value: "Cincel Studio" } });
    fireEvent.click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo guardar");
  });
});

describe("Ajustes › General one-time pickup of the legacy header links", () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  const legacyLinks = {
    instagram: "https://www.instagram.com/cincel.mx/",
    website: "https://www.cincel.mx/",
    email: "hola@cincel.mx",
  };

  it("prefills the empty fields from this browser and marks the key as migrated after saving", async () => {
    window.localStorage.setItem(LEGACY_HEADER_LINKS_STORAGE_KEY, JSON.stringify(legacyLinks));
    actions.saveGeneralSettingsAction.mockResolvedValue({ savedAt: SAVED_AT });
    renderPage();

    await waitFor(() => expect(field("Instagram").value).toBe(legacyLinks.instagram));
    expect(field("Sitio web").value).toBe(legacyLinks.website);
    expect(field("Correo").value).toBe(legacyLinks.email);
    expect(screen.getByText(/Se cargaron los enlaces guardados en este navegador/)).toBeTruthy();
    expect(window.localStorage.getItem(HEADER_LINKS_MIGRATED_STORAGE_KEY)).toBeNull();

    fireEvent.click(saveButton());

    await waitFor(() => expect(actions.saveGeneralSettingsAction).toHaveBeenCalledTimes(1));
    expect(actions.saveGeneralSettingsAction.mock.calls[0][0].company).toMatchObject({
      instagramUrl: legacyLinks.instagram,
      website: legacyLinks.website,
      contactEmail: legacyLinks.email,
    });
    await waitFor(() => expect(window.localStorage.getItem(HEADER_LINKS_MIGRATED_STORAGE_KEY)).toBeTruthy());
    expect(screen.queryByText(/Se cargaron los enlaces guardados en este navegador/)).toBeNull();
  });

  it("ignores the legacy key once it was migrated", () => {
    window.localStorage.setItem(LEGACY_HEADER_LINKS_STORAGE_KEY, JSON.stringify(legacyLinks));
    window.localStorage.setItem(HEADER_LINKS_MIGRATED_STORAGE_KEY, "2026-11-01T00:00:00.000Z");
    renderPage();

    expect(field("Instagram").value).toBe("");
    expect(screen.queryByText(/Se cargaron los enlaces guardados en este navegador/)).toBeNull();
  });

  it("keeps the saved values and stops reading the key when the server already has every link", async () => {
    window.localStorage.setItem(LEGACY_HEADER_LINKS_STORAGE_KEY, JSON.stringify(legacyLinks));
    renderPage(savedWithLinks());

    await waitFor(() => expect(window.localStorage.getItem(HEADER_LINKS_MIGRATED_STORAGE_KEY)).toBeTruthy());
    expect(field("Instagram").value).toBe("https://instagram.com/cincel");
    expect(saveButton().hasAttribute("disabled")).toBe(true);
  });
});
