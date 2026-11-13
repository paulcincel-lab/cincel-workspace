// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  ETAPA_BADGE_EMPTY_TEXT,
  EtapaBadge,
  etapaBadgeModel,
  type EtapaBadgeVariant,
} from "@/components/widgets/EtapaBadge";
import { ETAPA_EXPECTED, ETAPA_FIXTURE } from "@/components/widgets/fixtures/status-adapters";
import type { PresentationStyle } from "@/lib/types/redesign";

vi.mock("@/components/shell/LoadingSkeleton", () => ({
  LoadingSkeleton: (props: { variant: string; rows?: number }) => (
    <div data-testid="loading-skeleton" data-variant={props.variant} data-rows={props.rows} />
  ),
}));

afterEach(cleanup);

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const VARIANTS: EtapaBadgeVariant[] = ["chip", "dot", "text"];
const KEYS = Object.keys(ETAPA_FIXTURE) as (keyof typeof ETAPA_FIXTURE)[];

function renderIn(style: PresentationStyle, ui: ReactNode) {
  return render(
    <StyleProvider style={style} scope="staff">
      {ui}
    </StyleProvider>
  );
}

function mark(container: HTMLElement) {
  const el = container.querySelector<HTMLElement>('[data-slot="etapa-badge"]');
  expect(el).not.toBeNull();
  return el!;
}

describe("etapaBadgeModel", () => {
  it.each(KEYS)("maps %s through compat to its label and slot", (key) => {
    expect(etapaBadgeModel(ETAPA_FIXTURE[key])).toEqual(ETAPA_EXPECTED[key]);
  });
});

describe("EtapaBadge per style and variant", () => {
  it.each(KEYS)("renders the same label for %s in every style and variant", (key) => {
    for (const style of STYLES) {
      for (const variant of VARIANTS) {
        const { container, unmount } = renderIn(style, <EtapaBadge etapa={ETAPA_FIXTURE[key]} variant={variant} />);
        expect(container.textContent).toBe(ETAPA_EXPECTED[key].label);
        unmount();
      }
    }
  });

  it("Visual defaults to the tinted chip (tint + ink) over AreaBadge", () => {
    const { container } = renderIn("visual", <EtapaBadge etapa={ETAPA_FIXTURE.diseno} />);
    expect(mark(container).getAttribute("data-variant")).toBe("chip");
    const badge = container.querySelector('[data-slot="badge"]')!;
    expect(badge.className).toContain("bg-chart-2/14");
    expect(badge.className).toContain("--chart-2-ink");
    expect(container.querySelector(".bg-chart-2")).not.toBeNull();
  });

  it("Decoración renders chart-4", () => {
    const chip = renderIn("visual", <EtapaBadge etapa={ETAPA_FIXTURE.decoracion} />);
    expect(mark(chip.container).getAttribute("data-color-slot")).toBe("4");
    const badge = chip.container.querySelector('[data-slot="badge"]')!;
    expect(badge.className).toContain("bg-chart-4/14");
    expect(badge.className).toContain("--chart-4-ink");
    expect(chip.container.querySelector(".bg-chart-4")).not.toBeNull();
    chip.unmount();
    const dot = renderIn("analitico", <EtapaBadge etapa={ETAPA_FIXTURE.decoracion} />);
    expect(dot.container.querySelector(".bg-chart-4")).not.toBeNull();
    expect(dot.container.textContent).toBe("Decoración");
  });

  it("Visual renders a neutral chip for an unknown etapa", () => {
    const { container } = renderIn("visual", <EtapaBadge etapa={ETAPA_FIXTURE.otro} />);
    expect(container.querySelector('[data-slot="badge"]')!.className).toContain("bg-muted");
    expect(container.querySelector(".bg-muted-foreground")).not.toBeNull();
  });

  it("Visual honors the dot and text variants", () => {
    const dot = renderIn("visual", <EtapaBadge etapa={ETAPA_FIXTURE.presale} variant="dot" />);
    expect(mark(dot.container).getAttribute("data-variant")).toBe("dot");
    expect(dot.container.querySelector(".bg-chart-1")).not.toBeNull();
    expect(dot.container.querySelector('[data-slot="badge"]')).toBeNull();
    dot.unmount();
    const text = renderIn("visual", <EtapaBadge etapa={ETAPA_FIXTURE.presale} variant="text" />);
    expect(mark(text.container).getAttribute("data-variant")).toBe("text");
    expect(text.container.querySelector('[class*="bg-"]')).toBeNull();
  });

  it("Esencial renders the chip as plain text with no tint", () => {
    const { container } = renderIn("esencial", <EtapaBadge etapa={ETAPA_FIXTURE.construccion} />);
    expect(mark(container).getAttribute("data-variant")).toBe("text");
    expect(container.querySelector('[data-slot="badge"]')).toBeNull();
    expect(container.querySelector('[class*="bg-"]')).toBeNull();
  });

  it("Esencial dot is the 6 px muted dot, never the etapa color", () => {
    const { container } = renderIn("esencial", <EtapaBadge etapa={ETAPA_FIXTURE.construccion} variant="dot" />);
    expect(mark(container).getAttribute("data-variant")).toBe("dot");
    expect(container.querySelector(".bg-muted-foreground")).not.toBeNull();
    expect(container.querySelector(".bg-chart-3")).toBeNull();
  });

  it("Analítico renders the chip as an 8 px color dot + text", () => {
    const { container } = renderIn("analitico", <EtapaBadge etapa={ETAPA_FIXTURE.construccion} />);
    expect(mark(container).getAttribute("data-variant")).toBe("dot");
    const dot = container.querySelector(".bg-chart-3")!;
    expect(dot).not.toBeNull();
    expect(dot.className).toContain("size-2");
    expect(container.querySelector('[data-slot="badge"]')).toBeNull();
  });

  it("Analítico honors the text variant", () => {
    const { container } = renderIn("analitico", <EtapaBadge etapa={ETAPA_FIXTURE.presale} variant="text" />);
    expect(mark(container).getAttribute("data-variant")).toBe("text");
  });

  it("renders only the chosen style", () => {
    for (const style of STYLES) {
      const { container, unmount } = renderIn(style, <EtapaBadge etapa={ETAPA_FIXTURE.presale} />);
      expect(container.querySelectorAll('[data-slot="etapa-badge"]')).toHaveLength(1);
      unmount();
    }
  });
});

describe("EtapaBadge states", () => {
  it.each(STYLES)("renders the default empty text in %s", (style) => {
    const { container } = renderIn(style, <EtapaBadge etapa={null} />);
    expect(container.textContent).toBe(ETAPA_BADGE_EMPTY_TEXT);
  });

  it("renders a custom empty text", () => {
    const { container } = renderIn("analitico", <EtapaBadge etapa={null} emptyText="Asignar etapa" />);
    expect(container.textContent).toBe("Asignar etapa");
  });

  it.each(STYLES)("renders the list LoadingSkeleton while loading in %s", (style) => {
    const { getByTestId, container } = renderIn(style, <EtapaBadge etapa={ETAPA_FIXTURE.presale} loading />);
    expect(getByTestId("loading-skeleton").getAttribute("data-variant")).toBe("list");
    expect(container.textContent).toBe("");
  });
});
