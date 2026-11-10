// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";

import { KpiStrip } from "@/components/widgets/KpiStrip";
import { kpiStripFixture } from "@/components/widgets/fixtures/grouped-table";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

async function seriousViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id);
}

describe("KpiStrip", () => {
  it("renders label, value, secondary and delta tone", () => {
    const { container } = render(<KpiStrip items={kpiStripFixture} />);
    const list = container.querySelector("dl");
    expect(list?.className).toContain("lg:grid-cols-5");
    expect(screen.getByText("Abiertas").tagName).toBe("DT");
    const abiertas = container.querySelector('[data-kpi="abiertas"]') as HTMLElement;
    expect(abiertas.querySelector('[data-slot="kpi-value"]')?.textContent).toBe("24");
    expect(abiertas.querySelector('[data-slot="kpi-delta"]')?.className).toContain("text-destructive");
    const vencidas = container.querySelector('[data-kpi="vencidas"]') as HTMLElement;
    expect(vencidas.querySelector('[data-slot="kpi-value"]')?.className).toContain("text-destructive");
    expect(vencidas.querySelector('[data-slot="kpi-delta"]')?.className).toContain("text-success");
    const pct = container.querySelector('[data-kpi="pct"]') as HTMLElement;
    expect(pct.querySelector('[data-slot="kpi-delta"]')?.className).toContain("text-muted-foreground");
    const proyectos = container.querySelector('[data-kpi="proyectos"]') as HTMLElement;
    expect(proyectos.querySelector('[data-slot="kpi-secondary"]')?.textContent).toBe("de 4");
    expect(proyectos.querySelector('[data-slot="kpi-delta"]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/font-bold|font-extrabold/);
  });

  it("loading skeleton", () => {
    const { container } = render(<KpiStrip items={kpiStripFixture} loading />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector("dl")).toBeNull();
  });

  it.each(["light", "dark"] as const)("has no serious or critical axe violations (%s)", async (mode) => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    const { container } = render(
      <main lang="es">
        <KpiStrip items={kpiStripFixture} />
      </main>,
    );
    expect(await seriousViolations(container)).toEqual([]);
  });
});
