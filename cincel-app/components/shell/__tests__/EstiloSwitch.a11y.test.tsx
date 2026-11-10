// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: vi.fn(),
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { PageHeader } from "@/components/shell/PageHeader";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { THEME_IDS } from "@/lib/ui/themes";

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // token pairs are covered by CONTRAST_PAIRS / checkContrast in lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function applyTheme(theme: string, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme-id", theme);
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-style", "visual");
  html.classList.toggle("dark", mode === "dark");
}

afterEach(() => {
  const html = document.documentElement;
  for (const attr of ["data-theme-id", "data-theme", "data-style"]) html.removeAttribute(attr);
  html.classList.remove("dark");
});

const MODES = ["light", "dark"] as const;

describe("EstiloSwitch and PageHeader accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(
          <main>
            <StyleProvider style="esencial" scope="staff">
              <PageHeader
                title="Proyectos"
                description="Todos los proyectos activos"
                breadcrumb={[{ label: "Inicio", href: "/inicio" }, { label: "Proyectos" }]}
                badge={<span>Admin</span>}
              />
            </StyleProvider>
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });

      it(`has no serious or critical axe violations when disabled (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(
          <main>
            <StyleProvider style="analitico" scope="portal" fixedByOrg>
              <EstiloSwitch scope="portal" />
            </StyleProvider>
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
