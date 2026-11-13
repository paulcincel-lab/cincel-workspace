// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { PeopleWidget, type PeopleShow } from "@/components/widgets/PeopleWidget";
import { PEOPLE_FIXTURE } from "@/components/widgets/fixtures/people";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle } from "@/lib/types/redesign";

vi.mock("@/lib/etapas/compat", () => {
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    etapaLabel: (key: string) => labels[key] ?? key,
    etapaColorSlot: (key: string) => slots[key] ?? null,
    etapaColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
  };
});

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;
const ALL: PeopleShow[] = ["load", "hours", "availability", "projects"];

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // the token pairs the widget uses are checked through `checkContrast` below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function Fixture({ layout }: { layout: "cards" | "rows" }) {
  return (
    <main>
      <h1>Personas</h1>
      <PeopleWidget
        people={PEOPLE_FIXTURE}
        show={ALL}
        layout={layout}
        actions={(p) => (
          <a href={`/tareas?responsable=${p.id}`} aria-label={`Ver tareas de ${p.name}`}>
            Ver tareas
          </a>
        )}
      />
      <PeopleWidget people={[]} show={ALL} />
    </main>
  );
}

describe("PeopleWidget accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        for (const layout of ["cards", "rows"] as const) {
          it(`has no serious or critical axe violations (${theme}, ${mode}, ${style}, ${layout})`, async () => {
            document.documentElement.setAttribute("data-theme", mode);
            document.documentElement.setAttribute("data-theme-id", theme);
            document.documentElement.classList.toggle("dark", mode === "dark");
            const { container } = render(
              <StyleProvider style={style} scope="staff">
                <Fixture layout={layout} />
              </StyleProvider>
            );
            expect(await seriousViolations(container)).toEqual([]);
          });
        }
      }
    }
  }

  it("never relies on color alone: every availability cell and load bar has a text equivalent", () => {
    for (const layout of ["cards", "rows"] as const) {
      const { container, unmount } = render(
        <StyleProvider style="visual" scope="staff">
          <Fixture layout={layout} />
        </StyleProvider>
      );
      for (const cell of container.querySelectorAll("span.block.h-6")) {
        expect(cell.textContent?.trim(), layout).not.toBe("");
      }
      for (const swatch of container.querySelectorAll("span[aria-hidden]")) {
        expect(swatch.textContent).toBe("");
      }
      // The load percentage is printed next to every bar.
      for (const p of PEOPLE_FIXTURE) expect(container.textContent).toContain(`${p.occupancyPct}%`);
      unmount();
    }
  });

  it("the text and tint pairs it uses pass contrast in every theme, light and dark", () => {
    const used = new Set([
      "foreground/card",
      "muted-foreground/card",
      "destructive/card",
      "success/card",
      "primary-foreground/primary",
      "ring/background",
    ]);
    const pairs = CONTRAST_PAIRS.filter((p) => used.has(p.pair)).map((p) => p.pair);
    expect(new Set(pairs)).toEqual(used);
    for (const theme of THEME_IDS) {
      for (const mode of MODES) {
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => used.has(r.pair) && !r.ok);
        expect(failing, `${theme} ${mode}`).toEqual([]);
      }
    }
  });
});
