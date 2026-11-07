import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  appearance: null as string | null,
  throwAppearance: false,
  company: {} as Record<string, unknown>,
  throwSettings: false,
}));

vi.mock("@/lib/repositories/app-settings-repository", () => ({
  getAppSettingEntry: async (key: string) => {
    if (key !== "appearance.theme") return null;
    if (store.throwAppearance) throw new Error("db down");
    return store.appearance === null ? null : { value: store.appearance, updatedAt: new Date() };
  },
}));
vi.mock("@/lib/settings/general-settings-server", () => ({
  getGeneralSettings: async () => {
    if (store.throwSettings) throw new Error("db down");
    return { settings: { company: store.company }, hasCustom: true, savedAt: null };
  },
}));

import {
  adminContactHref,
  authRedesignOn,
  getAdminContactEmail,
  getOrgRedesignFlags,
  isAuthRedesignOn,
  normalizeContactEmail,
} from "./auth-appearance";

const stored = (data: Record<string, unknown>) => JSON.stringify({ version: 1, data });

describe("auth appearance", () => {
  beforeEach(() => {
    store.appearance = null;
    store.throwAppearance = false;
    store.company = {};
    store.throwSettings = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the defaults (redesign off) when the setting is missing", async () => {
    expect(await getOrgRedesignFlags()).toEqual({ redesignDefault: false, redesignAvailable: true });
    expect(await isAuthRedesignOn()).toBe(false);
  });

  it("reads both flags from the stored org appearance", async () => {
    store.appearance = stored({ baseTheme: "azul", v: 3, redesignDefault: true, redesignAvailable: true });
    expect(await getOrgRedesignFlags()).toEqual({ redesignDefault: true, redesignAvailable: true });
    expect(await isAuthRedesignOn()).toBe(true);
  });

  it("is off when the kill switch is off, whatever the default", async () => {
    store.appearance = stored({ redesignDefault: true, redesignAvailable: false });
    expect(await isAuthRedesignOn()).toBe(false);
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["wrong shape", JSON.stringify({ redesignDefault: true, redesignAvailable: true })],
    ["non-boolean flags", stored({ redesignDefault: "yes", redesignAvailable: true })],
  ])("keeps today's look on %s", async (_label, value) => {
    store.appearance = value;
    expect(await isAuthRedesignOn()).toBe(false);
  });

  it("keeps today's look when the DB can't be read", async () => {
    store.throwAppearance = true;
    expect(await isAuthRedesignOn()).toBe(false);
  });

  it("authRedesignOn needs both flags", () => {
    expect(authRedesignOn({ redesignDefault: true, redesignAvailable: true })).toBe(true);
    expect(authRedesignOn({ redesignDefault: false, redesignAvailable: true })).toBe(false);
    expect(authRedesignOn({ redesignDefault: true, redesignAvailable: false })).toBe(false);
  });

  it("returns the contact email from General settings", async () => {
    store.company = { primaryEmail: "otro@example.test", contactEmail: "  admin@example.test " };
    expect(await getAdminContactEmail()).toBe("admin@example.test");
  });

  it("returns an empty contact email when missing, empty, invalid or unreadable", async () => {
    expect(await getAdminContactEmail()).toBe("");
    store.company = { contactEmail: "" };
    expect(await getAdminContactEmail()).toBe("");
    store.company = { contactEmail: "no es correo" };
    expect(await getAdminContactEmail()).toBe("");
    store.throwSettings = true;
    expect(await getAdminContactEmail()).toBe("");
  });

  it("normalizes contact emails", () => {
    expect(normalizeContactEmail("a@b.mx")).toBe("a@b.mx");
    expect(normalizeContactEmail(42)).toBe("");
    expect(normalizeContactEmail("a@b")).toBe("");
    expect(normalizeContactEmail("a@b.mx?cc=x@y.mx")).toBe("");
    expect(normalizeContactEmail("a@b.mx&body=hola")).toBe("");
    expect(normalizeContactEmail("javascript:alert(1)")).toBe("");
  });

  it("builds the mailto link with a subject", () => {
    expect(adminContactHref("admin@example.test")).toBe(
      "mailto:admin@example.test?subject=Acceso%20a%20Cincel%20Workspace",
    );
  });
});
