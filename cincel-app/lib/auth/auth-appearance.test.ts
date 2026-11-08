import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  company: {} as Record<string, unknown>,
  throwSettings: false,
}));

vi.mock("@/lib/settings/general-settings-server", () => ({
  getGeneralSettings: async () => {
    if (store.throwSettings) throw new Error("db down");
    return { settings: { company: store.company }, hasCustom: true, savedAt: null };
  },
}));

import { adminContactHref, getAdminContactEmail, normalizeContactEmail } from "./auth-appearance";

describe("auth appearance", () => {
  beforeEach(() => {
    store.company = {};
    store.throwSettings = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
