// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { Plus } from "lucide-react";

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: vi.fn(),
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PageHeader } from "@/components/shell/PageHeader";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import type { PresentationStyle } from "@/lib/types/redesign";

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // token pairs are covered by CONTRAST_PAIRS / checkContrast in lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function applyAppearance(style: PresentationStyle, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme-id", "azul");
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-style", style);
  html.classList.toggle("dark", mode === "dark");
}

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  for (const attr of ["data-theme-id", "data-theme", "data-style"]) html.removeAttribute(attr);
  html.classList.remove("dark");
});

const STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

describe("PageHeader accessibility", () => {
  for (const style of STYLES) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations (${style}, ${mode})`, async () => {
        applyAppearance(style, mode);
        const { container } = render(
          <main>
            <StyleProvider style={style} scope="staff">
              <PageHeader
                title="Tareas"
                description="Todas las tareas de tus proyectos, por tramo."
                breadcrumb={[{ label: "Inicio", href: "/inicio" }, { label: "Tareas" }]}
                badge={<Badge variant="secondary">Admin</Badge>}
                actions={
                  <>
                    <Button variant="outline">Exportar</Button>
                    <Button>
                      <Plus aria-hidden="true" data-icon="inline-start" />
                      Nueva tarea
                    </Button>
                  </>
                }
              />
            </StyleProvider>
          </main>,
        );
        expect(container.querySelectorAll("h1")).toHaveLength(1);
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("has no serious or critical axe violations without the switch (estilo={false})", async () => {
    applyAppearance("visual", "light");
    const { container } = render(
      <main>
        <StyleProvider style="visual" scope="staff">
          <PageHeader estilo={false} title="Ajustes" description="Tus preferencias." />
        </StyleProvider>
      </main>,
    );
    expect(await seriousViolations(container)).toEqual([]);
  });
});
