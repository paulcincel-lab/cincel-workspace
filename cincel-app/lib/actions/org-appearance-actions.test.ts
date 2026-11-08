/**
 * Org appearance writes (redesign BE §7.1, §8.2): guards, the contrast gate,
 * the `LOW_CONTRAST` message format, version bump and revalidation, and reset
 * keeping the style / override settings. Also: every preset passes
 * `checkContrast` in all six theme × mode combos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrgAppearance, StoredOrgAppearance, ThemeId } from "@/lib/types/redesign";
import { checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

const ADMIN = { member: { role: "Administrador" }, access: "Administrador" };
const COLLABORATOR = { member: { role: "Arquitecto" }, access: "Colaborador" };

const currentUser = vi.hoisted(() => ({ value: { member: { role: "Administrador" }, access: "Administrador" } }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => currentUser.value) }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

/** In-memory `appearance.theme` row; `writeOrgAppearance` bumps `v` like the real repository. */
const store = vi.hoisted(() => ({ value: null as StoredOrgAppearance | null }));
const repo = vi.hoisted(() => ({
  writeOrgAppearance: vi.fn(async (next: (current: StoredOrgAppearance | null) => OrgAppearance) => {
    const stored = { ...next(store.value), v: (store.value?.v ?? 0) + 1 };
    store.value = stored;
    return stored;
  }),
}));
vi.mock("@/lib/repositories/org-appearance-repository", () => repo);

import { unwrapActionResult } from "./action-result";
import {
  resetOrgAppearanceAction as resetOrgAppearanceResult,
  saveOrgAppearanceAction as saveOrgAppearanceResult,
} from "./org-appearance-actions";

/** The actions return `ActionResult`; unwrapped, a failure throws its code as before. */
const saveOrgAppearanceAction = async (input: OrgAppearance) => unwrapActionResult(await saveOrgAppearanceResult(input));
const resetOrgAppearanceAction = async (base: ThemeId) => unwrapActionResult(await resetOrgAppearanceResult(base));

function clone(theme: ThemeId = "azul"): OrgAppearance {
  return structuredClone(THEME_PRESETS[theme]);
}

const LOW_CONTRAST_FORMAT = /^LOW_CONTRAST: [a-z0-9-]+\/[a-z0-9-]+ (light|dark) \d+\.\d{2}(, [a-z0-9-]+\/[a-z0-9-]+ (light|dark) \d+\.\d{2})*$/;

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.value = ADMIN;
  store.value = { ...clone("azul"), v: 1 };
});

describe("presets and the contrast gate", () => {
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`${theme} ${mode} passes every pair`, () => {
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((result) => !result.ok);
        expect(failing).toEqual([]);
      });
    }
  }
});

describe("saveOrgAppearanceAction", () => {
  it("refuses non-admins with FORBIDDEN and writes nothing", async () => {
    currentUser.value = COLLABORATOR;
    await expect(saveOrgAppearanceAction(clone())).rejects.toThrow(/^FORBIDDEN/);
    expect(repo.writeOrgAppearance).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload with INVALID", async () => {
    const bad = clone() as unknown as Record<string, unknown>;
    bad.fontFamily = "Comic Sans";
    await expect(saveOrgAppearanceAction(bad as unknown as OrgAppearance)).rejects.toThrow(/^INVALID/);

    const badColor = clone();
    badColor.tokens.primary.light = "blue";
    await expect(saveOrgAppearanceAction(badColor)).rejects.toThrow(/^INVALID/);

    const extra = { ...clone(), v: 9 } as unknown as OrgAppearance;
    await expect(saveOrgAppearanceAction(extra)).rejects.toThrow(/^INVALID/);
    expect(repo.writeOrgAppearance).not.toHaveBeenCalled();
  });

  it("saves every seeded preset unchanged", async () => {
    for (const theme of THEME_IDS) {
      await expect(saveOrgAppearanceAction(clone(theme))).resolves.toEqual(THEME_PRESETS[theme]);
    }
    expect(repo.writeOrgAppearance).toHaveBeenCalledTimes(THEME_IDS.length);
  });

  it("lists every failing pair as LOW_CONTRAST: <pair> <mode> <ratio>, comma-separated", async () => {
    const edit = clone();
    edit.tokens["muted-foreground"].light = "#c0c0c0";
    edit.tokens["primary-foreground"].dark = edit.tokens.primary.dark;

    const error = await saveOrgAppearanceAction(edit).catch((err: unknown) => err as Error);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(LOW_CONTRAST_FORMAT);
    expect(message).toContain("muted-foreground/background light ");
    expect(message).toContain("muted-foreground/card light ");
    expect(message).toContain("primary-foreground/primary dark 1.00");

    const expected = (["light", "dark"] as const)
      .flatMap((mode) => checkContrast(edit.tokens, mode))
      .filter((result) => !result.ok);
    expect(message.slice("LOW_CONTRAST: ".length).split(", ")).toHaveLength(expected.length);
    expect(repo.writeOrgAppearance).not.toHaveBeenCalled();
  });

  it("stores the full appearance, bumps v and revalidates the root layout", async () => {
    const edit = clone();
    edit.tokens.primary.light = "#1d4ed8";
    edit.styleDefault = "analitico";
    edit.shape.radius = 10;

    await expect(saveOrgAppearanceAction(edit)).resolves.toEqual(edit);
    expect(store.value).toEqual({ ...edit, v: 2 });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");

    await saveOrgAppearanceAction(edit);
    expect(store.value?.v).toBe(3);
  });
});

describe("ActionResult (production strips thrown action errors)", () => {
  it("returns the codes as { ok: false, error } instead of throwing", async () => {
    currentUser.value = COLLABORATOR;
    await expect(saveOrgAppearanceResult(clone())).resolves.toEqual({
      ok: false,
      error: expect.stringMatching(/^FORBIDDEN/),
    });
    await expect(resetOrgAppearanceResult("grafito")).resolves.toEqual({
      ok: false,
      error: expect.stringMatching(/^FORBIDDEN/),
    });

    currentUser.value = ADMIN;
    const edit = clone();
    edit.tokens["muted-foreground"].light = "#c0c0c0";
    await expect(saveOrgAppearanceResult(edit)).resolves.toEqual({
      ok: false,
      error: expect.stringMatching(LOW_CONTRAST_FORMAT),
    });
  });

  it("wraps a successful save as { ok: true, data }", async () => {
    await expect(saveOrgAppearanceResult(clone("calido"))).resolves.toEqual({ ok: true, data: THEME_PRESETS.calido });
  });
});

describe("resetOrgAppearanceAction", () => {
  it("refuses non-admins with FORBIDDEN", async () => {
    currentUser.value = COLLABORATOR;
    await expect(resetOrgAppearanceAction("grafito")).rejects.toThrow(/^FORBIDDEN/);
    expect(repo.writeOrgAppearance).not.toHaveBeenCalled();
  });

  it("replaces tokens, type scale and shape with the preset and keeps the style settings", async () => {
    const customized = clone("azul");
    customized.tokens.primary.light = "#1d4ed8";
    customized.typeScale.pageTitle = { size: 30, weight: 500 };
    customized.shape = { radius: 4, cardPadding: 12, gap: 8, shadow: "marcada" };
    customized.styleDefault = "esencial";
    customized.allowUserOverride = false;
    store.value = { ...customized, v: 5 };

    const result = await resetOrgAppearanceAction("calido");

    const preset = THEME_PRESETS.calido;
    expect(result.baseTheme).toBe("calido");
    expect(result.tokens).toEqual(preset.tokens);
    expect(result.typeScale).toEqual(preset.typeScale);
    expect(result.shape).toEqual(preset.shape);
    expect(result).toMatchObject({
      styleDefault: "esencial",
      allowUserOverride: false,
    });
    expect(store.value).toEqual({ ...result, v: 6 });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("does not share objects with the preset", async () => {
    const result = await resetOrgAppearanceAction("azul");
    expect(result.tokens).not.toBe(THEME_PRESETS.azul.tokens);
    expect(result.shape).not.toBe(THEME_PRESETS.azul.shape);
  });

  it("falls back to the Azul defaults for the kept settings when nothing is stored", async () => {
    store.value = null;
    const result = await resetOrgAppearanceAction("grafito");
    expect(result).toEqual({ ...THEME_PRESETS.grafito });
    const saved = store.value as StoredOrgAppearance | null;
    expect(saved?.v).toBe(1);
  });
});
