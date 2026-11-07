// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DistributionWidgetProps } from "./DistributionWidget";

vi.mock("./DistributionWidget", () => ({
  DistributionWidget: (props: DistributionWidgetProps) => (
    <div data-testid="distribution">{props.segments.map((s) => `${s.label}:${s.value}`).join(",")}</div>
  ),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";

import { DistributionStripWidget } from "./DistributionStripWidget";

const SEGMENTS = [
  { key: "presale", label: "Presale", value: 2, colorVar: "var(--chart-1)" },
  { key: "diseno", label: "Diseño", value: 5, colorVar: "var(--chart-2)" },
  { key: "construccion", label: "Construcción", value: 0, colorVar: "var(--chart-3)" },
];

function renderIn(style: PresentationStyle, segments = SEGMENTS) {
  return render(
    <StyleProvider style={style} scope="staff">
      <DistributionStripWidget title="Proyectos por tramo" segments={segments} totalLabel="Proyectos" />
    </StyleProvider>,
  );
}

afterEach(() => cleanup());

describe("DistributionStripWidget", () => {
  it("Visual: one flexible segment per category with count and name, zeros left out", () => {
    const { container } = renderIn("visual");
    const items = container.querySelectorAll("[data-segment]");
    expect([...items].map((li) => li.getAttribute("data-segment"))).toEqual(["presale", "diseno"]);
    expect((items[1] as HTMLElement).style.flex).toContain("5");
    expect(items[1].textContent).toBe("5Diseño");
    expect(screen.getByRole("region", { name: "Proyectos por tramo" })).toBeTruthy();
    expect(screen.queryByTestId("distribution")).toBeNull();
  });

  it("Esencial: the same data through DistributionWidget", () => {
    renderIn("esencial");
    expect(screen.getByTestId("distribution").textContent).toBe("Presale:2,Diseño:5,Construcción:0");
  });

  it("Analítico: the same data through DistributionWidget", () => {
    renderIn("analitico");
    expect(screen.getByTestId("distribution").textContent).toBe("Presale:2,Diseño:5,Construcción:0");
  });

  it("Visual renders nothing without counts", () => {
    const { container } = renderIn("visual", SEGMENTS.map((s) => ({ ...s, value: 0 })));
    expect(container.querySelector("[data-slot=distribution-strip]")).toBeNull();
  });

  it("has no serious axe violations", async () => {
    const { container } = renderIn("visual");
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
