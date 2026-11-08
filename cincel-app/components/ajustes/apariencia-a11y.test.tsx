// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OrgAppearance, ThemeId, UserPreferences } from "@/lib/types/redesign";
import { DEFAULT_USER_PREFERENCES } from "@/lib/ui/preferences";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

vi.mock("@/components/shell/AppearanceProvider", () => ({
  useAppearance: () => ({ appearance: null, setPreference: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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
        const { container } = render(
          <main>
            <AparienciaClient preferences={{ ...PREFS, mode }} org={org} isAdmin />
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("has no serious axe violations with overrides and the new design turned off", async () => {
    setHtmlAppearance("azul", "light");
    const org: OrgAppearance = { ...THEME_PRESETS.azul, allowUserOverride: false };
    const { container } = render(
      <main>
        <AparienciaClient preferences={PREFS} org={org} isAdmin={false} />
      </main>,
    );
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("names every radio group and control", () => {
    setHtmlAppearance("azul", "light");
    const { getByRole } = render(
      <AparienciaClient preferences={PREFS} org={{ ...THEME_PRESETS.azul, allowUserOverride: true }} isAdmin={false} />,
    );
    for (const name of ["Tema", "Estilo de presentación", "Modo", "Densidad"]) {
      expect(getByRole("radiogroup", { name })).toBeTruthy();
    }
    expect(getByRole("slider", { name: "Tamaño de texto" })).toBeTruthy();
  });
});
