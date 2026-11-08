// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DistributionWidgetProps } from "./DistributionWidget";

vi.mock("./DistributionWidget", () => ({
  DistributionWidget: (props: DistributionWidgetProps) => (
    <div data-testid="distribution" data-view={props.view ?? ""}>
      {props.segments.map((s) => `${s.label}:${s.value}`).join(",")}
    </div>
  ),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";

import { DistributionStripWidget, type DistributionStripWidgetProps } from "./DistributionStripWidget";

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

function renderWith(style: PresentationStyle, props: Partial<DistributionStripWidgetProps>) {
  return render(
    <StyleProvider style={style} scope="staff">
      <DistributionStripWidget title="Proyectos por tramo" segments={SEGMENTS} totalLabel="Proyectos" {...props} />
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

  it("without onSelect the segments are not buttons", () => {
    renderIn("visual");
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});

describe("DistributionStripWidget selection (opt-in)", () => {
  it("Visual: segments become toggle buttons with aria-pressed; a click hands back the key", () => {
    const onSelect = vi.fn();
    const { container } = renderWith("visual", { selectedKey: "diseno", onSelect });
    const presale = screen.getByRole("button", { name: /Presale/ });
    const diseno = screen.getByRole("button", { name: /Diseño/ });
    expect(presale.getAttribute("aria-pressed")).toBe("false");
    expect(diseno.getAttribute("aria-pressed")).toBe("true");
    // Zeros stay out, also as buttons.
    expect(screen.queryByRole("button", { name: /Construcción/ })).toBeNull();
    // The segment keeps its count + name (no extra text).
    expect(container.querySelector("[data-segment=diseno]")?.textContent).toBe("5Diseño");
    fireEvent.click(presale);
    expect(onSelect).toHaveBeenCalledWith("presale");
    // Pressing the selected one again also hands back its key (the page clears it).
    fireEvent.click(diseno);
    expect(onSelect).toHaveBeenLastCalledWith("diseno");
  });

  it("Esencial and Analítico: a row of segment toggles under DistributionWidget carries the selection", () => {
    for (const style of ["esencial", "analitico"] as const) {
      const onSelect = vi.fn();
      renderWith(style, { selectedKey: "presale", onSelect });
      const group = screen.getByRole("group", { name: "Filtrar: Proyectos por tramo" });
      const buttons = within(group).getAllByRole("button");
      expect(buttons.map((b) => b.getAttribute("data-segment"))).toEqual(["presale", "diseno"]);
      expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
      expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(buttons[1]);
      expect(onSelect).toHaveBeenCalledWith("diseno");
      expect(screen.getByTestId("distribution")).toBeTruthy();
      cleanup();
    }
  });

  it("without onSelect Esencial renders no toggle row", () => {
    renderIn("esencial");
    expect(screen.queryByRole("group")).toBeNull();
  });
});

describe("DistributionStripWidget view (opt-in)", () => {
  it("table: the DistributionWidget table in every style, Visual included", () => {
    for (const style of ["visual", "esencial", "analitico"] as const) {
      const { container } = renderWith(style, { view: "table" });
      expect(container.querySelector("[data-slot=distribution-strip]")).toBeNull();
      expect(screen.getByTestId("distribution").getAttribute("data-view")).toBe("table");
      cleanup();
    }
  });

  it("chart: the strip in Visual, the list in Esencial, the donut in Analítico", () => {
    const visual = renderWith("visual", { view: "chart" });
    expect(visual.container.querySelector("[data-slot=distribution-strip]")).toBeTruthy();
    cleanup();

    renderWith("esencial", { view: "chart" });
    expect(screen.getByTestId("distribution").getAttribute("data-view")).toBe("");
    cleanup();

    renderWith("analitico", { view: "chart" });
    expect(screen.getByTestId("distribution").getAttribute("data-view")).toBe("chart");
  });

  it("without a view each style renders as before (no view handed down)", () => {
    for (const style of ["esencial", "analitico"] as const) {
      renderIn(style);
      expect(screen.getByTestId("distribution").getAttribute("data-view")).toBe("");
      cleanup();
    }
  });

  it("segment toggles have no serious axe violations in every style", async () => {
    for (const style of ["visual", "esencial", "analitico"] as const) {
      const { container } = renderWith(style, { selectedKey: "diseno", onSelect: () => undefined });
      const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
      cleanup();
    }
  });
});
