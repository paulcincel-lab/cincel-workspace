// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// The library widgets are replaced by spies so these tests pin down which
// widget each message renders through and with what data.
const calls = vi.hoisted(() => ({
  WidgetCard: [] as Record<string, unknown>[],
  DistributionWidget: [] as Record<string, unknown>[],
  KpiWidget: [] as Record<string, unknown>[],
  AttentionListWidget: [] as Record<string, unknown>[],
}));

vi.mock("@/components/widgets/WidgetCard", () => ({
  WidgetCard: (props: Record<string, unknown> & { children?: ReactNode; actions?: ReactNode }) => {
    calls.WidgetCard.push(props);
    return (
      <section data-widget="WidgetCard">
        <h3>{props.title as string}</h3>
        {props.actions}
        {props.children}
      </section>
    );
  },
}));
vi.mock("@/components/widgets/DistributionWidget", () => ({
  DistributionWidget: (props: Record<string, unknown>) => {
    calls.DistributionWidget.push(props);
    return <div data-widget="DistributionWidget" />;
  },
}));
vi.mock("@/components/widgets/KpiWidget", () => ({
  KpiWidget: (props: Record<string, unknown>) => {
    calls.KpiWidget.push(props);
    return <div data-widget="KpiWidget" />;
  },
}));
vi.mock("@/components/widgets/AttentionListWidget", () => ({
  AttentionListWidget: (props: Record<string, unknown>) => {
    calls.AttentionListWidget.push(props);
    return <div data-widget="AttentionListWidget" />;
  },
}));

import { AssistantCardMessage } from "../AssistantCardMessage";
import { AssistantChartMessage } from "../AssistantChartMessage";
import { AssistantListMessage } from "../AssistantListMessage";
import { AssistantStatGridMessage } from "../AssistantStatGridMessage";
import { CARD, CHART_BAR, CHART_LINE, LIST, STAT_GRID, STYLES, renderInStyle } from "./fixtures";

beforeEach(() => {
  for (const list of Object.values(calls)) list.length = 0;
});

afterEach(() => cleanup());

describe.each(STYLES)("assistant widgets render through the library (%s)", (style) => {
  it("render_chart bar → DistributionWidget with one chart token per point", () => {
    const { container } = renderInStyle(style, <AssistantChartMessage {...CHART_BAR} />);
    expect(container.querySelector('[data-widget="DistributionWidget"]')).toBeTruthy();
    expect(calls.DistributionWidget).toHaveLength(1);
    expect(calls.DistributionWidget[0]).toMatchObject({
      title: "Ocupación por área",
      segments: [
        { label: "Diseño", value: 7, colorVar: "var(--chart-1)" },
        { label: "Construcción", value: 12, colorVar: "var(--chart-2)" },
        { label: "Decoración", value: 3, colorVar: "var(--chart-3)" },
      ],
    });
  });

  it("render_chart line → chart.tsx line inside a WidgetCard", () => {
    const { container } = renderInStyle(style, <AssistantChartMessage {...CHART_LINE} />);
    expect(calls.WidgetCard).toHaveLength(1);
    expect(calls.WidgetCard[0]).toMatchObject({ title: "Tareas cerradas por semana" });
    expect(calls.DistributionWidget).toHaveLength(0);
    const chart = container.querySelector('[data-slot="chart"]');
    expect(chart?.getAttribute("role")).toBe("img");
    expect(chart?.getAttribute("aria-label")).toBe("Tareas cerradas por semana: S1 4, S2 9, S3 6");
  });

  it("render_card → WidgetCard with the badge as a plain shadcn variant and the fields", () => {
    const { getByText } = renderInStyle(style, <AssistantCardMessage {...CARD} />);
    expect(calls.WidgetCard).toHaveLength(1);
    expect(calls.WidgetCard[0]).toMatchObject({ title: "Casa Ensenada", tone: "warn" });
    expect(getByText("En riesgo").getAttribute("data-slot")).toBe("badge");
    expect(getByText("Construcción · fase 3")).toBeTruthy();
    expect(getByText("Avance")).toBeTruthy();
    expect(getByText("62 %")).toBeTruthy();
    expect(getByText("Ana López")).toBeTruthy();
  });

  it("render_card without badge passes no tone and no actions", () => {
    renderInStyle(style, <AssistantCardMessage title="Cliente" fields={[]} />);
    expect(calls.WidgetCard[0]).toMatchObject({ title: "Cliente", tone: undefined, actions: undefined });
  });

  it("render_stat_grid → KpiWidget inside a WidgetCard when titled", () => {
    renderInStyle(style, <AssistantStatGridMessage {...STAT_GRID} />);
    expect(calls.WidgetCard[0]).toMatchObject({ title: "Avance de proyectos activos" });
    expect(calls.KpiWidget).toHaveLength(1);
    expect(calls.KpiWidget[0]).toMatchObject({
      items: [
        { label: "Casa Ensenada", value: 62, display: "62 %", caption: "En riesgo" },
        { label: "Depto. Roma", value: 88, display: "88 %", caption: "A tiempo" },
        { label: "Oficina Polanco", value: 1250, display: "1,250" },
      ],
    });
  });

  it("render_stat_grid without title → bare KpiWidget", () => {
    renderInStyle(style, <AssistantStatGridMessage stats={STAT_GRID.stats} />);
    expect(calls.WidgetCard).toHaveLength(0);
    expect(calls.KpiWidget).toHaveLength(1);
  });

  it("render_list → AttentionListWidget with one plain item per entry", () => {
    renderInStyle(style, <AssistantListMessage {...LIST} />);
    expect(calls.AttentionListWidget).toHaveLength(1);
    const props = calls.AttentionListWidget[0] as { title: string; totalCount: number; items: { title: string }[] };
    expect(props.title).toBe("Falta en el checklist");
    expect(props.totalCount).toBe(3);
    expect(props.items.map((i) => i.title)).toEqual(LIST.items);
  });
});
