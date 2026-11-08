// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { qk } from "@/lib/query/keys";
import type { AjustesAparienciaPageData } from "@/lib/query/options/ajustes";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { AppearanceStoreProvider } from "@/lib/stores/appearance-store";
import type { OrgAppearance, ThemeId, UserPreferences } from "@/lib/types/redesign";
import { DEFAULT_USER_PREFERENCES, resolveAppearance } from "@/lib/ui/preferences";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: vi.fn(async () => new Promise(() => {})),
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({
  getAjustesAparienciaPageData: vi.fn(),
  getAjustesNotificacionesPageData: vi.fn(),
  getAjustesPerfilPageData: vi.fn(),
  getAjustesIntegracionesPageData: vi.fn(),
}));

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

import { AparienciaClient } from "./AparienciaClient";

const PREFS: UserPreferences = { ...DEFAULT_USER_PREFERENCES };

/** Apariencia with its hydrated page data and a seeded `useAppearance` store. */
function render(ui: { preferences: UserPreferences; org: OrgAppearance; isAdmin: boolean }, wrapInMain = true) {
  const client = createTestQueryClient();
  client.setQueryData<AjustesAparienciaPageData>(qk.ajustes.page("apariencia"), {
    org: ui.org,
    isAdmin: ui.isAdmin,
    overridesAllowed: ui.org.allowUserOverride,
  });
  const appearance = resolveAppearance({ ...ui.org, v: 1 }, ui.preferences);
  const tree = (
    <AppearanceStoreProvider initial={appearance} preferences={ui.preferences} fixedByOrg={!ui.org.allowUserOverride}>
      <AparienciaClient />
    </AppearanceStoreProvider>
  );
  return renderWithQueryClient(wrapInMain ? <main>{tree}</main> : tree, { client });
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide;
  // token pairs are covered by `CONTRAST_PAIRS` / `checkContrast` in lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function setHtmlAppearance(theme: ThemeId, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme-id", theme);
  html.setAttribute("data-theme", mode);
  html.classList.toggle("dark", mode === "dark");
}

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme-id");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

describe("Ajustes › Apariencia accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious axe violations in ${theme} ${mode}`, async () => {
        setHtmlAppearance(theme, mode);
        const org: OrgAppearance = { ...THEME_PRESETS[theme], allowUserOverride: true };
        const { container } = render({ preferences: { ...PREFS, mode }, org, isAdmin: true });
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("has no serious axe violations with overrides and the new design turned off", async () => {
    setHtmlAppearance("azul", "light");
    const org: OrgAppearance = { ...THEME_PRESETS.azul, allowUserOverride: false };
    const { container } = render({ preferences: PREFS, org, isAdmin: false });
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("names every radio group and control", () => {
    setHtmlAppearance("azul", "light");
    const { getByRole } = render(
      { preferences: PREFS, org: { ...THEME_PRESETS.azul, allowUserOverride: true }, isAdmin: false },
      false,
    );
    for (const name of ["Tema", "Estilo de presentación", "Modo", "Densidad"]) {
      expect(getByRole("radiogroup", { name })).toBeTruthy();
    }
    expect(getByRole("slider", { name: "Tamaño de texto" })).toBeTruthy();
  });
});
