// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/layout/Sidebar", () => ({ default: () => null }));
vi.mock("@/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/components/configuracion/PrimaryColorPicker", () => ({ PrimaryColorPicker: () => null }));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const actions = vi.hoisted(() => ({
  saveGeneralSettingsAction: vi.fn(),
  restoreGeneralSettingsAction: vi.fn(),
}));
vi.mock("@/lib/actions/app-settings-actions", () => actions);

import {
  buildDefaultGeneralSettings,
  buildDefaultLoadedGeneralSettings,
  formatGeneralSettingsSavedAt,
  GENERAL_SETTINGS_STORAGE_KEY,
} from "@/lib/settings/general-settings";

import GeneralSettingsWorkspace from "./GeneralSettingsWorkspace";

const admin = { primaryColor: null, canManage: true, canManageGeneral: true };
const SAVED_AT = "2026-11-04T16:30:00.000Z";

describe("GeneralSettingsWorkspace", () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows no storage key, settings source or save time before the first save", () => {
    render(<GeneralSettingsWorkspace appearance={admin} general={buildDefaultLoadedGeneralSettings()} />);

    expect(screen.queryByText(/Fuente actual/)).toBeNull();
    expect(screen.queryByText(/Clave de persistencia/)).toBeNull();
    expect(screen.queryByText(/cincel\.settings\.general/)).toBeNull();
    expect(screen.queryByText(/^Guardado /)).toBeNull();
  });

  it("shows the server save time it was given", () => {
    const general = { settings: buildDefaultGeneralSettings(), hasCustom: true, savedAt: SAVED_AT };
    render(<GeneralSettingsWorkspace appearance={admin} general={general} />);

    expect(screen.getByText(formatGeneralSettingsSavedAt(SAVED_AT))).toBeTruthy();
  });

  it("saves through the server and shows the save time it returns", async () => {
    actions.saveGeneralSettingsAction.mockResolvedValue({ savedAt: SAVED_AT });
    render(<GeneralSettingsWorkspace appearance={admin} general={buildDefaultLoadedGeneralSettings()} />);

    // Trade name and system name share the default value; the trade name comes first.
    fireEvent.change(screen.getAllByDisplayValue("Cincel Workspace")[0], { target: { value: "Cincel Studio" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(screen.getByText(formatGeneralSettingsSavedAt(SAVED_AT))).toBeTruthy());
    expect(actions.saveGeneralSettingsAction.mock.calls[0][0].company.tradeName).toBe("Cincel Studio");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the avatar-menu links it doesn't show when saving", async () => {
    actions.saveGeneralSettingsAction.mockResolvedValue({ savedAt: SAVED_AT });
    const settings = buildDefaultGeneralSettings();
    settings.company.instagramUrl = "https://instagram.com/cincel";
    settings.company.contactEmail = "hola@cincel.mx";
    render(<GeneralSettingsWorkspace appearance={admin} general={{ settings, hasCustom: true, savedAt: SAVED_AT }} />);

    expect(screen.queryByLabelText("Instagram")).toBeNull();
    fireEvent.change(screen.getAllByDisplayValue("Cincel Workspace")[0], { target: { value: "Cincel Studio" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(actions.saveGeneralSettingsAction).toHaveBeenCalledTimes(1));
    expect(actions.saveGeneralSettingsAction.mock.calls[0][0].company).toMatchObject({
      tradeName: "Cincel Studio",
      instagramUrl: "https://instagram.com/cincel",
      contactEmail: "hola@cincel.mx",
    });
  });

  it("does not touch the legacy header links in this browser", () => {
    window.localStorage.setItem("cincel.header.links.v1", JSON.stringify({ instagram: "https://instagram.com/x" }));
    render(<GeneralSettingsWorkspace appearance={admin} general={buildDefaultLoadedGeneralSettings()} />);

    expect(window.localStorage.getItem("cincel.header.links.v1")).not.toBeNull();
    expect(window.localStorage.getItem("cincel.header.links.migrated.v1")).toBeNull();
  });

  it("shows an inline error when the save fails", async () => {
    actions.saveGeneralSettingsAction.mockRejectedValue(new Error("FORBIDDEN"));
    render(<GeneralSettingsWorkspace appearance={admin} general={buildDefaultLoadedGeneralSettings()} />);

    fireEvent.change(screen.getAllByDisplayValue("Cincel Workspace")[0], { target: { value: "Cincel Studio" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo guardar");
    expect(screen.queryByText(/^Guardado /)).toBeNull();
  });

  it("keeps saving and restoring off for non-admins", () => {
    const general = { settings: buildDefaultGeneralSettings(), hasCustom: true, savedAt: SAVED_AT };
    render(<GeneralSettingsWorkspace appearance={{ primaryColor: null, canManage: false, canManageGeneral: false }} general={general} />);

    fireEvent.change(screen.getAllByDisplayValue("Cincel Workspace")[0], { target: { value: "Cincel Studio" } });
    expect(screen.getByRole("button", { name: "Guardar cambios" }).hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Restaurar configuración por defecto" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("Solo un administrador puede cambiar esta configuración.")).toBeTruthy();
  });

  it("picks up a value saved in this browser before the move to the server", async () => {
    const data = buildDefaultGeneralSettings();
    data.company.tradeName = "Cincel Local";
    window.localStorage.setItem(GENERAL_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, data }));

    render(<GeneralSettingsWorkspace appearance={admin} general={buildDefaultLoadedGeneralSettings()} />);

    expect(await screen.findByDisplayValue("Cincel Local")).toBeTruthy();
    expect(screen.getByText(/Se cargó la configuración guardada en este navegador/)).toBeTruthy();
  });

  it("drops the old browser value once the server has settings", () => {
    window.localStorage.setItem(
      GENERAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, data: buildDefaultGeneralSettings() }),
    );
    const general = { settings: buildDefaultGeneralSettings(), hasCustom: true, savedAt: SAVED_AT };
    render(<GeneralSettingsWorkspace appearance={admin} general={general} />);

    expect(window.localStorage.getItem(GENERAL_SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
