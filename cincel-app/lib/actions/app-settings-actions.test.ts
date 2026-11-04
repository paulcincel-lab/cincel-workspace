import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildDefaultGeneralSettings, GENERAL_SETTINGS_SETTING_KEY } from "@/lib/settings/general-settings";

const currentUser = vi.hoisted(() => ({ value: { member: { role: "Administrador" }, access: "Administrador" } }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => currentUser.value) }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const repo = vi.hoisted(() => ({ getAppSetting: vi.fn(), getAppSettingEntry: vi.fn(), setAppSetting: vi.fn() }));
vi.mock("@/lib/repositories/app-settings-repository", () => repo);

import {
  fetchGeneralSettingsAction,
  restoreGeneralSettingsAction,
  saveGeneralSettingsAction,
} from "./app-settings-actions";

const ADMIN = { member: { role: "Administrador" }, access: "Administrador" };
const COLLABORATOR = { member: { role: "Arquitecto" }, access: "Colaborador" };

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.value = ADMIN;
});

describe("saveGeneralSettingsAction", () => {
  it("stores the settings as JSON and returns the server save time", async () => {
    const savedAt = new Date("2026-11-04T16:30:00.000Z");
    repo.setAppSetting.mockResolvedValue(savedAt);
    const settings = buildDefaultGeneralSettings();
    settings.company.tradeName = "Cincel Studio";

    await expect(saveGeneralSettingsAction(settings)).resolves.toEqual({ savedAt: savedAt.toISOString() });

    expect(repo.setAppSetting).toHaveBeenCalledWith(GENERAL_SETTINGS_SETTING_KEY, expect.any(String));
    expect(JSON.parse(repo.setAppSetting.mock.calls[0][1])).toEqual({ version: 1, data: settings });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses non-admins", async () => {
    currentUser.value = COLLABORATOR;
    await expect(saveGeneralSettingsAction(buildDefaultGeneralSettings())).rejects.toThrow("FORBIDDEN");
    expect(repo.setAppSetting).not.toHaveBeenCalled();
  });

  it("allows Dirección", async () => {
    currentUser.value = { member: { role: "Director" }, access: "Dirección" };
    repo.setAppSetting.mockResolvedValue(new Date());
    await expect(saveGeneralSettingsAction(buildDefaultGeneralSettings())).resolves.toHaveProperty("savedAt");
  });

  it("rejects invalid settings", async () => {
    const settings = buildDefaultGeneralSettings();
    settings.company.logoUrl = "https://example.com/logo.png";
    await expect(saveGeneralSettingsAction(settings)).rejects.toThrow("INVALID_GENERAL_SETTINGS");
    await expect(saveGeneralSettingsAction({ company: {} })).rejects.toThrow("INVALID_GENERAL_SETTINGS");
    expect(repo.setAppSetting).not.toHaveBeenCalled();
  });
});

describe("restoreGeneralSettingsAction", () => {
  it("removes the stored settings", async () => {
    await restoreGeneralSettingsAction();
    expect(repo.setAppSetting).toHaveBeenCalledWith(GENERAL_SETTINGS_SETTING_KEY, null);
  });

  it("refuses non-admins", async () => {
    currentUser.value = COLLABORATOR;
    await expect(restoreGeneralSettingsAction()).rejects.toThrow("FORBIDDEN");
    expect(repo.setAppSetting).not.toHaveBeenCalled();
  });
});

describe("fetchGeneralSettingsAction", () => {
  it("returns the defaults when nothing is stored", async () => {
    repo.getAppSettingEntry.mockResolvedValue(null);
    await expect(fetchGeneralSettingsAction()).resolves.toEqual({
      settings: buildDefaultGeneralSettings(),
      hasCustom: false,
      savedAt: null,
    });
  });

  it("returns the stored settings with the row's save time, for any signed-in user", async () => {
    currentUser.value = COLLABORATOR;
    const data = buildDefaultGeneralSettings();
    data.system.systemName = "Cincel ERP";
    const updatedAt = new Date("2026-11-04T16:30:00.000Z");
    repo.getAppSettingEntry.mockResolvedValue({ value: JSON.stringify({ version: 1, data }), updatedAt });

    await expect(fetchGeneralSettingsAction()).resolves.toEqual({
      settings: data,
      hasCustom: true,
      savedAt: updatedAt.toISOString(),
    });
  });

  it("falls back to the defaults when the DB can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.getAppSettingEntry.mockRejectedValue(new Error("down"));
    await expect(fetchGeneralSettingsAction()).resolves.toMatchObject({ hasCustom: false, savedAt: null });
  });
});
