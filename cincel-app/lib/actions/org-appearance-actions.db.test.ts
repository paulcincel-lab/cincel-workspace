// @vitest-environment node
/**
 * Org appearance writes against a real Postgres (redesign BE §7.1, §8.2):
 * a save is what the next page load renders (new `v`, new `:root` / `.dark`
 * block), a denied role writes nothing, the `LOW_CONTRAST` message format, and
 * reset keeping the style / override settings. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`). The
 * `appearance.theme` row is restored afterwards.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ access: "Administrador" as string, role: "Administrador" as string }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: "admin",
      name: "Admin",
      role: session.role,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "admin@cincel.example",
    access: session.access,
  })),
}));

describe.skipIf(!url)("org appearance actions (test DB)", async () => {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const { appSettings } = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/org-appearance-repository");
  const raw = await import("@/lib/actions/org-appearance-actions");
  const { unwrapActionResult } = await import("@/lib/actions/action-result");
  /** The actions return `ActionResult`; unwrapped, a failure throws its code as before. */
  const actions = {
    saveOrgAppearanceAction: async (input: Parameters<typeof raw.saveOrgAppearanceAction>[0]) =>
      unwrapActionResult(await raw.saveOrgAppearanceAction(input)),
    resetOrgAppearanceAction: async (base: Parameters<typeof raw.resetOrgAppearanceAction>[0]) =>
      unwrapActionResult(await raw.resetOrgAppearanceAction(base)),
  };
  const { THEME_PRESETS } = await import("@/lib/ui/themes");
  const { DEFAULT_USER_PREFERENCES, resolveAppearance } = await import("@/lib/ui/preferences");
  const { appearanceStyleBlock, toCssVars } = await import("@/lib/ui/appearance-css");

  const KEY = repo.ORG_APPEARANCE_SETTING_KEY;
  let original: string | null = null;

  async function rawRow(): Promise<string | null> {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
    return row?.value ?? null;
  }

  async function putRow(value: string | null): Promise<void> {
    if (value === null) {
      await db.delete(appSettings).where(eq(appSettings.key, KEY));
      return;
    }
    await db
      .insert(appSettings)
      .values({ key: KEY, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  }

  /** What the root layout renders on the next load (BE §8.2). */
  async function nextLoad() {
    const stored = await repo.readStoredOrgAppearance();
    expect(stored).not.toBeNull();
    const resolved = resolveAppearance(stored!, { ...DEFAULT_USER_PREFERENCES });
    return { stored: stored!, resolved, block: appearanceStyleBlock(resolved.cssVars) };
  }

  beforeAll(async () => {
    original = await rawRow();
  });

  afterAll(async () => {
    await putRow(original);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    session.access = "Administrador";
    session.role = "Administrador";
    await putRow(repo.serializeStoredOrgAppearance({ ...structuredClone(THEME_PRESETS.azul), v: 1 }));
  });

  it("save → the next load renders the new block with the bumped version", async () => {
    const before = await nextLoad();
    const edit = structuredClone(THEME_PRESETS.azul);
    edit.tokens.primary.light = "#1d4ed8";
    edit.tokens.primary.dark = "#93c5fd";
    edit.shape.radius = 10;

    await expect(actions.saveOrgAppearanceAction(edit)).resolves.toEqual(edit);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");

    const after = await nextLoad();
    expect(after.stored).toEqual({ ...edit, v: before.stored.v + 1 });
    expect(after.resolved.version).toBe(before.stored.v + 1);
    expect(after.resolved.cssVars.light).toEqual(toCssVars(edit, "light"));
    expect(after.resolved.cssVars.dark).toEqual(toCssVars(edit, "dark"));
    expect(after.resolved.cssVars.light["--primary"]).toBe("#1d4ed8");
    expect(after.block).toContain('html:root[data-theme="light"]');
    expect(after.block).toContain('html:root[data-theme="dark"]');
    expect(after.block).toContain("#1d4ed8");
    expect(after.block).toContain("#93c5fd");
    expect(after.block).not.toBe(before.block);
  });

  it("a denied role gets FORBIDDEN and the row is unchanged", async () => {
    session.access = "Colaborador";
    session.role = "Arquitecto";
    const before = await rawRow();
    const edit = structuredClone(THEME_PRESETS.grafito);
    await expect(actions.saveOrgAppearanceAction(edit)).rejects.toThrow(/^FORBIDDEN/);
    await expect(actions.resetOrgAppearanceAction("grafito")).rejects.toThrow(/^FORBIDDEN/);
    // Returned, not thrown: production keeps the code.
    await expect(raw.saveOrgAppearanceAction(edit)).resolves.toEqual({ ok: false, error: expect.stringMatching(/^FORBIDDEN/) });
    expect(await rawRow()).toBe(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a low-contrast edit throws LOW_CONTRAST: <pair> <mode> <ratio>[, …] and stores nothing", async () => {
    const before = await rawRow();
    const edit = structuredClone(THEME_PRESETS.azul);
    edit.tokens["muted-foreground"].light = "#c0c0c0";

    const error = await actions.saveOrgAppearanceAction(edit).catch((err: unknown) => err as Error);
    expect((error as Error).message).toMatch(
      /^LOW_CONTRAST: [a-z0-9-]+\/[a-z0-9-]+ (light|dark) \d+\.\d{2}(, [a-z0-9-]+\/[a-z0-9-]+ (light|dark) \d+\.\d{2})*$/,
    );
    expect((error as Error).message).toContain("muted-foreground/background light ");
    expect(await rawRow()).toBe(before);
  });

  it("reset keeps the style and override settings and bumps v", async () => {
    const customized = structuredClone(THEME_PRESETS.azul);
    customized.tokens.primary.light = "#1d4ed8";
    customized.styleDefault = "esencial";
    customized.allowUserOverride = false;
    await putRow(repo.serializeStoredOrgAppearance({ ...customized, v: 7 }));

    const result = await actions.resetOrgAppearanceAction("grafito");

    const stored = await repo.readStoredOrgAppearance();
    expect(stored).toEqual({ ...result, v: 8 });
    expect(result.baseTheme).toBe("grafito");
    expect(result.tokens).toEqual(THEME_PRESETS.grafito.tokens);
    expect(result.typeScale).toEqual(THEME_PRESETS.grafito.typeScale);
    expect(result.shape).toEqual(THEME_PRESETS.grafito.shape);
    expect(result).toMatchObject({
      styleDefault: "esencial",
      allowUserOverride: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("saves create the row when it is missing", async () => {
    await putRow(null);
    await actions.saveOrgAppearanceAction(structuredClone(THEME_PRESETS.calido));
    expect(await repo.readStoredOrgAppearance()).toEqual({ ...THEME_PRESETS.calido, v: 1 });
  });
});
