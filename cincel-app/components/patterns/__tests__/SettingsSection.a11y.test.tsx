// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { THEME_IDS } from "@/lib/ui/themes";

const MODES = ["light", "dark"] as const;

function applyTheme(theme: string, mode: (typeof MODES)[number]) {
  const html = document.documentElement;
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // token pairs are covered by the CONTRAST_PAIRS / checkContrast preset test.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function Fixture() {
  return (
    <main>
      <SettingsSection
        title="Enlaces de la organización"
        description="Aparecen en el menú de tu perfil."
        actions={<Button variant="outline">Restablecer</Button>}
      >
        <SettingsRow label="Instagram" htmlFor="a11y-ig" control={<Input id="a11y-ig" />} />
        <SettingsRow
          label="Mensaje de bienvenida"
          description="Se muestra en Inicio."
          htmlFor="a11y-msg"
          control={<Textarea id="a11y-msg" />}
        />
        <SettingsRow
          label="Densidad"
          description="Espacio entre elementos."
          control={
            <div>
              <Button variant="outline" aria-pressed="true">
                Cómoda
              </Button>
              <Button variant="outline" aria-pressed="false">
                Compacta
              </Button>
            </div>
          }
        />
      </SettingsSection>
      <SettingsSection title="Modo">
        <SettingsRow label="Horas por semana" htmlFor="a11y-h" control={<Input id="a11y-h" type="number" />} />
      </SettingsSection>
    </main>
  );
}

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-id");
  html.classList.remove("dark");
});

describe("SettingsSection / SettingsRow accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(<Fixture />);
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
