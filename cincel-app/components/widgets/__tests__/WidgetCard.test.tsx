// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Activity } from "lucide-react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { WidgetCard, type WidgetCardProps } from "@/components/widgets/WidgetCard";
import { widgetCardEmptyFixture, widgetCardFixture, type WidgetCardFixture } from "@/components/widgets/fixtures/widget-card";
import type { PresentationStyle } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function Body({ fixture }: { fixture: WidgetCardFixture }) {
  if (fixture.items.length === 0) return null;
  return (
    <ul>
      {fixture.items.map((item) => (
        <li key={item.key}>
          <span>{item.label}</span> <span data-testid={`value-${item.key}`}>{item.display ?? item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function renderCard(style: PresentationStyle, fixture: WidgetCardFixture, extra: Partial<WidgetCardProps> = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <WidgetCard
        title={fixture.title}
        icon={Activity}
        tone={fixture.tone}
        actions={<a href={fixture.moreHref}>Ver todo</a>}
        {...extra}
      >
        <Body fixture={fixture} />
      </WidgetCard>
    </StyleProvider>,
  );
}

function values(): string[] {
  return widgetCardFixture.items.map((item) => screen.getByTestId(`value-${item.key}`).textContent ?? "");
}

afterEach(() => {
  cleanup();
});

describe("WidgetCard", () => {
  it("Visual: card with icon chip, title and action link", () => {
    const { container } = renderCard("visual", widgetCardFixture);
    const region = screen.getByRole("region", { name: "Ritmo semanal" });
    expect(region.getAttribute("data-style")).toBe("visual");
    expect(region.getAttribute("data-slot")).toBe("card");
    expect(screen.getByRole("heading", { level: 2, name: "Ritmo semanal" })).toBeTruthy();
    const chip = container.querySelector('[data-slot="widget-card-icon"]');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute("aria-hidden")).toBe("true");
    expect(region.className).toContain("shadow-(--shadow-card)");
    expect(within(region).getByRole("link", { name: "Ver todo" }).getAttribute("href")).toBe("/tareas");
    expect(values()).toEqual(["24", "18", "3"]);
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });

  it("Esencial: same card without icon chip and without shadow", () => {
    const { container } = renderCard("esencial", widgetCardFixture);
    const region = screen.getByRole("region", { name: "Ritmo semanal" });
    expect(region.getAttribute("data-style")).toBe("esencial");
    expect(container.querySelector('[data-slot="widget-card-icon"]')).toBeNull();
    expect(region.className).toContain("shadow-none");
    expect(region.className).toContain("border");
    expect(screen.getByRole("link", { name: "Ver todo" })).toBeTruthy();
    expect(values()).toEqual(["24", "18", "3"]);
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });

  it("Analítico: table container with radius 10 and a header row", () => {
    const { container } = renderCard("analitico", widgetCardFixture);
    const region = screen.getByRole("region", { name: "Ritmo semanal" });
    expect(region.getAttribute("data-style")).toBe("analitico");
    expect(region.className).toContain("rounded-[10px]");
    expect(region.className).toContain("shadow-none");
    expect(container.querySelector('[data-slot="widget-card-icon"]')).toBeNull();
    const header = container.querySelector('[data-slot="widget-card-header-row"]');
    expect(header).not.toBeNull();
    expect(header?.className).toContain("bg-muted");
    expect(header?.className).toContain("border-b");
    expect(within(header as HTMLElement).getByRole("link", { name: "Ver todo" })).toBeTruthy();
    expect(values()).toEqual(["24", "18", "3"]);
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });

  it("renders the same numbers in every style and only the chosen style", () => {
    for (const style of STYLES) {
      const { container, unmount } = renderCard(style, widgetCardFixture);
      expect(container.querySelectorAll("[data-style]")).toHaveLength(1);
      expect(container.querySelector("[data-style]")?.getAttribute("data-style")).toBe(style);
      expect(values()).toEqual(["24", "18", "3"]);
      unmount();
    }
  });

  it("omits the icon chip in Visual when no icon is given", () => {
    const { container } = render(
      <StyleProvider style="visual" scope="staff">
        <WidgetCard title="Ritmo semanal">
          <Body fixture={widgetCardFixture} />
        </WidgetCard>
      </StyleProvider>,
    );
    expect(container.querySelector('[data-slot="widget-card-icon"]')).toBeNull();
  });

  it("renders the empty state through `emptyState` in every style", () => {
    for (const style of STYLES) {
      const { unmount } = renderCard(style, widgetCardEmptyFixture, {
        emptyState: { title: "Sin datos esta semana", description: "Aparecerán cuando se creen tareas." },
      });
      const region = screen.getByRole("region", { name: "Ritmo semanal" });
      expect(within(region).getByText("Sin datos esta semana")).toBeTruthy();
      expect(within(region).queryByRole("list")).toBeNull();
      unmount();
    }
  });

  it("does not render the empty state when there is content", () => {
    renderCard("visual", widgetCardFixture, { emptyState: { title: "Sin datos esta semana" } });
    expect(screen.queryByText("Sin datos esta semana")).toBeNull();
    expect(values()).toEqual(["24", "18", "3"]);
  });

  it("renders the LoadingSkeleton variant instead of the body while loading", () => {
    for (const style of STYLES) {
      const { unmount } = renderCard(style, widgetCardFixture, { loading: true, skeleton: "kpis" });
      const region = screen.getByRole("region", { name: "Ritmo semanal" });
      expect(region.getAttribute("aria-busy")).toBe("true");
      expect(screen.queryByTestId("value-creadas")).toBeNull();
      unmount();
    }
  });

  it("drops the body padding when `padded` is false", () => {
    const { container } = renderCard("visual", widgetCardFixture, { padded: false });
    expect(container.querySelector('[data-slot="card-content"]')?.className).toContain("px-0");
  });

  it("tints the icon chip per tone", () => {
    const { container, unmount } = renderCard("visual", { ...widgetCardFixture, tone: "critical" });
    expect(container.querySelector('[data-slot="widget-card-icon"]')?.className).toContain("text-destructive");
    expect(screen.getByRole("region", { name: "Ritmo semanal" }).getAttribute("data-tone")).toBe("critical");
    unmount();
  });
});
