// @vitest-environment node
/**
 * Preferences actions (redesign BE §7.1, §8.1, §8.2, §9.2) against a real
 * Postgres: defaults without a row, persisted patches, the rewritten
 * `cincel-appearance` cookie, `OVERRIDE_DISABLED`, `INVALID` and
 * the org appearance reader. The org setting is served by a mocked
 * `getAppSetting` so the shared `appearance.theme` row is never touched. Runs
 * only when TEST_DATABASE_URL points at a migrated database; the staff row
 * carries a per-run marker and is deleted afterwards (its preferences cascade).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { unwrapActions } from "@/tests/helpers/action-result";

import type { OrgAppearance } from "@/lib/types/redesign";
import { THEME_PRESETS } from "@/lib/ui/themes";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

const state = vi.hoisted(() => ({
  staffId: "",
  org: null as null | (Record<string, unknown> & { v: number }),
  jar: new Map<string, { value: string; options: Record<string, unknown> }>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = state.jar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      state.jar.set(name, { value, options });
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The org appearance read opts out of prerendering with `connection()`; there is no request scope here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => ({ member: { id: state.staffId }, access: "Colaborador", email: "" }),
  getSession: async () => ({ user: { id: state.staffId } }),
}));
vi.mock("@/lib/repositories/app-settings-repository", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/repositories/app-settings-repository")>();
  return {
    ...real,
    getAppSetting: async (key: string) =>
      key === "appearance.theme" && state.org ? JSON.stringify({ version: 1, data: state.org }) : real.getAppSetting(key),
  };
});

function setOrg(overrides: Partial<OrgAppearance> = {}, v = 3) {
  state.org = { ...THEME_PRESETS.azul, ...overrides, v };
}

describe.skipIf(!url)("preferences actions (test DB)", async () => {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { fetchMyPreferencesAction, updateMyPreferencesAction } = unwrapActions(await import("@/lib/actions/preferences-actions"));
  const { fetchOrgAppearanceAction } = await import("@/lib/actions/org-appearance-actions");
  const { IMPLEMENTED: PREFERENCES_FLAGS } = await import("@/lib/actions/preferences-actions.flags");
  const { IMPLEMENTED: ORG_FLAGS } = await import("@/lib/actions/org-appearance-actions.flags");
  const { APPEARANCE_COOKIE, parseAppearanceCookie } = await import("@/lib/ui/preferences");

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Preferencias ${run}`, role: "Colaborador" })
      .returning({ id: schema.staff.id });
    state.staffId = member!.id;
  });

  afterAll(async () => {
    if (state.staffId) await db.delete(schema.staff).where(eq(schema.staff.id, state.staffId));
  });

  beforeEach(async () => {
    state.jar.clear();
    setOrg();
    await db.delete(schema.userPreferences).where(eq(schema.userPreferences.staffId, state.staffId));
  });

  it("flips the IMPLEMENTED flags of the preferences and org appearance actions", () => {
    expect(PREFERENCES_FLAGS).toEqual({ fetchMyPreferencesAction: true, updateMyPreferencesAction: true });
    expect(ORG_FLAGS).toEqual({
      fetchOrgAppearanceAction: true,
      saveOrgAppearanceAction: true,
      resetOrgAppearanceAction: true,
    });
  });

  it("returns the defaults when there is no row", async () => {
    expect(await fetchMyPreferencesAction()).toEqual({
      theme: null,
      mode: "light",
      style: null,
      density: "comoda",
      textSize: 14,
      quietHours: null,
    });
  });

  it("persists theme, mode, style, density and text size and rewrites the cookie", async () => {
    const result = await updateMyPreferencesAction({
      theme: "calido",
      mode: "dark",
      style: "analitico",
      density: "compacta",
      textSize: 15.5,
    });

    expect(result.preferences).toEqual({
      theme: "calido",
      mode: "dark",
      style: "analitico",
      density: "compacta",
      textSize: 15.5,
      quietHours: null,
    });
    expect(result.appearance).toMatchObject({
      theme: "calido",
      mode: "dark",
      style: "analitico",
      density: "compacta",
      textSize: 15.5,
      version: 3,
    });
    expect(result.appearance.cssVars.dark["--background"]).toBe(THEME_PRESETS.calido.tokens.background.dark);
    expect(result.appearance.cssVars.light["--text-base"]).toBe("15.5px");

    const [row] = await db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.staffId, state.staffId));
    expect(row).toMatchObject({
      theme: "calido",
      mode: "dark",
      style: "analitico",
      density: "compacta",
      textSize: 15.5,
    });
    expect(await fetchMyPreferencesAction()).toEqual(result.preferences);

    const cookie = state.jar.get(APPEARANCE_COOKIE);
    expect(cookie).toBeDefined();
    expect(JSON.parse(cookie!.value)).toEqual({
      theme: "calido",
      mode: "dark",
      style: "analitico",
      density: "compacta",
      textSize: 15.5,
      v: 3,
    });
    expect(cookie!.options).toMatchObject({ httpOnly: false, sameSite: "lax", path: "/" });
    expect(cookie!.options.maxAge).toBe(365 * 24 * 60 * 60);
  });

  it("merges patches: omitted fields keep their stored value", async () => {
    await updateMyPreferencesAction({ mode: "light", textSize: 13 });
    const { preferences } = await updateMyPreferencesAction({ density: "compacta" });
    expect(preferences).toMatchObject({ mode: "light", textSize: 13, density: "compacta" });
  });

  it("stores and clears quiet hours", async () => {
    let { preferences } = await updateMyPreferencesAction({ quietHours: { from: "21:00", to: "07:30" } });
    expect(preferences.quietHours).toEqual({ from: "21:00", to: "07:30" });
    ({ preferences } = await updateMyPreferencesAction({ quietHours: null }));
    expect(preferences.quietHours).toBeNull();
  });

  it("clears a theme override with null (back to the org theme)", async () => {
    await updateMyPreferencesAction({ theme: "grafito" });
    const { preferences, appearance } = await updateMyPreferencesAction({ theme: null });
    expect(preferences.theme).toBeNull();
    expect(appearance.theme).toBe("azul");
  });

  it("throws OVERRIDE_DISABLED for a theme or style while the org fixed them", async () => {
    setOrg({ allowUserOverride: false });
    await expect(updateMyPreferencesAction({ theme: "calido" })).rejects.toThrow("OVERRIDE_DISABLED");
    await expect(updateMyPreferencesAction({ style: "esencial" })).rejects.toThrow("OVERRIDE_DISABLED");
    expect(state.jar.has(APPEARANCE_COOKIE)).toBe(false);
    // Mode, density and text size stay editable.
    const { preferences } = await updateMyPreferencesAction({ mode: "dark", theme: null });
    expect(preferences.mode).toBe("dark");
  });

  it("keeps stored overrides while the org fixed them, and ignores them in the resolver", async () => {
    await updateMyPreferencesAction({ theme: "grafito", style: "esencial" });
    setOrg({ allowUserOverride: false });
    const { preferences, appearance } = await updateMyPreferencesAction({ textSize: 16 });
    expect(preferences).toMatchObject({ theme: "grafito", style: "esencial" });
    expect(appearance).toMatchObject({ theme: "azul", style: "visual" });
  });

  it("never writes the retired redesign_enabled column", async () => {
    await updateMyPreferencesAction({ mode: "light" });
    const [row] = await db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.staffId, state.staffId));
    expect(row.retiredRedesignOptIn).toBeNull();
  });

  it("throws INVALID for values outside the contract", async () => {
    await expect(updateMyPreferencesAction({ textSize: 17 as never })).rejects.toThrow("INVALID");
    await expect(updateMyPreferencesAction({ theme: "rosa" as never })).rejects.toThrow("INVALID");
    await expect(updateMyPreferencesAction({ mode: "auto" as never })).rejects.toThrow("INVALID");
    await expect(
      updateMyPreferencesAction({ quietHours: { from: "25:00", to: "07:00" } }),
    ).rejects.toThrow("INVALID");
    await expect(updateMyPreferencesAction({ extra: 1 } as never)).rejects.toThrow("INVALID");
  });

  it("the cookie is ignored once the org version changes", async () => {
    await updateMyPreferencesAction({ mode: "dark" });
    const raw = state.jar.get(APPEARANCE_COOKIE)!.value;
    expect(parseAppearanceCookie(raw, 3)).not.toBeNull();
    setOrg({}, 4);
    expect(parseAppearanceCookie(raw, 4)).toBeNull();
    const { readAppearanceCookie } = await import("@/lib/ui/preferences-server");
    expect(await readAppearanceCookie(4)).toBeNull();
    expect(await readAppearanceCookie(3)).toMatchObject({ mode: "dark", v: 3 });
  });

  it("fetchOrgAppearanceAction returns the stored org appearance without its version", async () => {
    setOrg({ baseTheme: "grafito", tokens: THEME_PRESETS.grafito.tokens, styleDefault: "esencial" }, 7);
    const org = await fetchOrgAppearanceAction();
    expect(org).toMatchObject({ baseTheme: "grafito", styleDefault: "esencial" });
    expect(org).not.toHaveProperty("v");
  });

  it("fetchOrgAppearanceAction falls back to the Azul preset when the setting is unreadable", async () => {
    state.org = { v: 1, baseTheme: "rosa" } as never;
    expect(await fetchOrgAppearanceAction()).toEqual(THEME_PRESETS.azul);
  });
});
