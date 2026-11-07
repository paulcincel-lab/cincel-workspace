// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { Inbox } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { EmptyState } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { LoadingSkeleton, type LoadingSkeletonProps } from "@/components/shell/LoadingSkeleton";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";
import type { ThemeId } from "@/lib/types/redesign";

const MODES = ["light", "dark"] as const;
const VARIANTS: LoadingSkeletonProps["variant"][] = ["kpis", "cards", "list", "table", "board", "calendar"];

/** The token pairs these three components draw text or controls with. */
const USED_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "primary-foreground/primary",
  "destructive/card",
  "destructive/background",
  "ring/background",
]);

function themeStyle(theme: ThemeId, mode: (typeof MODES)[number]): CSSProperties {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars: Record<string, string> = {};
  for (const name of TOKEN_NAMES) vars[`--${name}`] = tokens[name][mode];
  return vars as CSSProperties;
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // the token pairs are checked with checkContrast below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

describe.each(THEME_IDS.flatMap((theme) => MODES.map((mode) => [theme, mode] as const)))(
  "system states, %s %s",
  (theme, mode) => {
    function renderInTheme(node: ReactNode) {
      document.documentElement.setAttribute("data-theme", mode);
      document.documentElement.classList.toggle("dark", mode === "dark");
      return render(
        <main lang="es" style={themeStyle(theme, mode)}>
          {node}
        </main>,
      );
    }

    it("EmptyState has no serious or critical axe violations", async () => {
      const { container } = renderInTheme(
        <>
          <EmptyState
            icon={Inbox}
            title="Aún no hay proyectos activos"
            description="Crea el primero para empezar."
            action={{ label: "Nuevo proyecto", href: "/proyectos?nuevo=1" }}
          />
          <EmptyState title="Ninguna tarea coincide con los filtros" action={{ label: "Limpiar filtros", onClick: () => undefined }} />
        </>,
      );
      expect(await seriousViolations(container)).toEqual([]);
    });

    it("ErrorState has no serious or critical axe violations", async () => {
      const { container } = renderInTheme(<ErrorState onRetry={() => undefined} code="a1b2c3" description="Revisa tu conexión." />);
      expect(await seriousViolations(container)).toEqual([]);
    });

    it("LoadingSkeleton variants have no serious or critical axe violations", async () => {
      const { container } = renderInTheme(
        <>
          {VARIANTS.map((v) => (
            <LoadingSkeleton key={v} variant={v} />
          ))}
        </>,
      );
      expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(VARIANTS.length);
      expect(await seriousViolations(container)).toEqual([]);
    });

    it("the token pairs the states use meet their contrast minimum", () => {
      const pairs = CONTRAST_PAIRS.filter((p) => USED_PAIRS.has(p.pair)).map((p) => p.pair);
      expect(pairs.length).toBe(USED_PAIRS.size);
      const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => USED_PAIRS.has(r.pair) && !r.ok);
      expect(failing).toEqual([]);
    });
  },
);
