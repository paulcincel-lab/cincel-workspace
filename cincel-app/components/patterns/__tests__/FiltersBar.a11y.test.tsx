// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { FiltersBar } from "@/components/patterns/FiltersBar";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle } from "@/lib/types/redesign";

vi.mock("next/link", async () => {
  const React = await import("react");
  type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    replace?: boolean;
    scroll?: boolean;
    prefetch?: boolean;
  };
  const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
    { href, replace, scroll, prefetch, ...rest },
    ref,
  ) {
    void replace;
    void scroll;
    void prefetch;
    return <a ref={ref} href={href} {...rest} />;
  });
  return { default: Link };
});

const MODES = ["light", "dark"] as const;
const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function applyTheme(theme: string, mode: (typeof MODES)[number]) {
  const html = document.documentElement;
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // the token pairs the bar uses are checked through `checkContrast` below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function Fixture() {
  return (
    <main>
      <FiltersBar
        chips={[
          { key: "todas", label: "Todas", count: 24, pressed: true, href: "/tareas" },
          { key: "diseno", label: "Diseño", count: 9, colorVar: "--chart-2", pressed: false, href: "/tareas?etapa=diseno" },
          { key: "construccion", label: "Construcción", count: 11, colorVar: "--chart-3", pressed: false, href: "/tareas?etapa=construccion" },
        ]}
        selects={[
          <button key="r" type="button" aria-haspopup="listbox">
            Responsable: Yo
          </button>,
        ]}
        search={{ value: "", placeholder: "Buscar tareas", onChange: () => {} }}
      />
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

describe("FiltersBar accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(<Fixture />);
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("renders the same markup in every presentation style", () => {
    const html = STYLES.map((style) => {
      const { container, unmount } = render(
        <StyleProvider style={style} scope="staff">
          <Fixture />
        </StyleProvider>,
      );
      // React `useId` counters advance across separate roots; compare markup without them.
      const out = container.innerHTML.replace(/base-ui-[^"\s]+/g, "base-ui-id");
      unmount();
      return out;
    });
    expect(new Set(html).size).toBe(1);
  });

  it("never relies on color alone: every color square sits beside its label", () => {
    const { container } = render(<Fixture />);
    for (const swatch of container.querySelectorAll("[data-slot=chip-swatch]")) {
      expect(swatch.getAttribute("aria-hidden")).toBe("true");
      expect(swatch.parentElement?.textContent?.trim()).not.toBe("");
    }
  });

  it("chip, focus ring and color square token pairs pass contrast in every theme, light and dark", () => {
    const used = new Set(["primary-foreground/primary", "foreground/background", "ring/background", "chart-2/card", "chart-3/card"]);
    expect(CONTRAST_PAIRS.filter((p) => used.has(p.pair))).toHaveLength(used.size);
    for (const theme of THEME_IDS) {
      for (const mode of MODES) {
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => used.has(r.pair) && !r.ok);
        expect(failing, `${theme} ${mode}`).toEqual([]);
      }
    }
  });
});
