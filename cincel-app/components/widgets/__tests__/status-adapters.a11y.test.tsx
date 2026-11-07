// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { StatusChip } from "@/components/widgets/StatusChip";
import { TramoBadge, type TramoBadgeVariant } from "@/components/widgets/TramoBadge";
import { STATUS_FIXTURE, TRAMO_FIXTURE } from "@/components/widgets/fixtures/status-adapters";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;
const VARIANTS: TramoBadgeVariant[] = ["chip", "dot", "text"];

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // it is checked through `checkContrast` below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function Fixture() {
  return (
    <ul>
      {Object.entries(STATUS_FIXTURE).map(([key, status]) => (
        <li key={`s-${key}`}>
          <StatusChip status={status} />
          <StatusChip status={status} size="md" />
        </li>
      ))}
      {Object.entries(TRAMO_FIXTURE).flatMap(([key, tramo]) =>
        VARIANTS.map((variant) => (
          <li key={`t-${key}-${variant}`}>
            <TramoBadge tramo={tramo} variant={variant} />
          </li>
        ))
      )}
      <li>
        <StatusChip status={null} />
        <TramoBadge tramo={null} />
      </li>
    </ul>
  );
}

describe("StatusChip and TramoBadge accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`has no serious or critical axe violations (${theme}, ${mode}, ${style})`, async () => {
          document.documentElement.setAttribute("data-theme", mode);
          document.documentElement.setAttribute("data-theme-id", theme);
          document.documentElement.classList.toggle("dark", mode === "dark");
          const { container } = render(
            <StyleProvider style={style} scope="staff">
              <Fixture />
            </StyleProvider>
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }
    }
  }

  it("never relies on color alone: every chip, dot and text mark carries its label", () => {
    for (const style of STYLES) {
      const { container, unmount } = render(
        <StyleProvider style={style} scope="staff">
          <Fixture />
        </StyleProvider>
      );
      for (const el of container.querySelectorAll('[data-slot="status-chip"], [data-slot="tramo-badge"]')) {
        expect(el.textContent?.trim()).not.toBe("");
      }
      for (const dot of container.querySelectorAll("span[aria-hidden]")) {
        expect(dot.textContent).toBe("");
      }
      unmount();
    }
  });

  it("tint + ink and chart dot pairs pass contrast in every theme, light and dark", () => {
    const pairs = new Set(
      CONTRAST_PAIRS.filter((p) => /^chart-\d-ink\/chart-\d-tint$|^chart-\d\/card$/.test(p.pair)).map((p) => p.pair)
    );
    expect(pairs.size).toBe(10);
    for (const theme of THEME_IDS) {
      for (const mode of MODES) {
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => pairs.has(r.pair) && !r.ok);
        expect(failing, `${theme} ${mode}`).toEqual([]);
      }
    }
  });
});
