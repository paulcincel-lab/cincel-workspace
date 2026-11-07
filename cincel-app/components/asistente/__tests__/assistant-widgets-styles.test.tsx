// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";

import { AssistantCardMessage } from "../AssistantCardMessage";
import { AssistantChartMessage } from "../AssistantChartMessage";
import { AssistantListMessage } from "../AssistantListMessage";
import { AssistantStatGridMessage } from "../AssistantStatGridMessage";
import { CARD, CHART_BAR, CHART_LINE, LIST, STAT_GRID, STYLES, renderInStyle } from "./fixtures";

afterEach(() => cleanup());

/** The same tool arguments show the same content in every style; only the library widget decides the look. */
describe.each(STYLES)("assistant widgets in the %s style", (style) => {
  it("render_chart bar shows the title and every label", () => {
    const { container } = renderInStyle(style, <AssistantChartMessage {...CHART_BAR} />);
    const text = container.textContent ?? "";
    expect(text).toContain(CHART_BAR.title);
    for (const point of CHART_BAR.data) expect(text).toContain(point.label);
  });

  it("render_chart line shows the title and a labelled chart", () => {
    const { container, getByRole } = renderInStyle(style, <AssistantChartMessage {...CHART_LINE} />);
    expect(container.textContent).toContain(CHART_LINE.title);
    expect(getByRole("img").getAttribute("aria-label")).toContain("S2 9");
  });

  it("render_card shows the title, subtitle, badge and every field", () => {
    const { container } = renderInStyle(style, <AssistantCardMessage {...CARD} />);
    const text = container.textContent ?? "";
    for (const part of [CARD.title, CARD.subtitle, CARD.badge.label]) expect(text).toContain(part);
    for (const field of CARD.fields) {
      expect(text).toContain(field.label);
      expect(text).toContain(field.value);
    }
  });

  it("render_stat_grid shows the title and every metric as written", () => {
    const { container } = renderInStyle(style, <AssistantStatGridMessage {...STAT_GRID} />);
    const text = container.textContent ?? "";
    expect(text).toContain(STAT_GRID.title);
    for (const stat of STAT_GRID.stats) {
      expect(text).toContain(stat.label);
      expect(text).toContain(stat.value);
    }
  });

  it("render_list shows the title and every entry", () => {
    const { container } = renderInStyle(style, <AssistantListMessage {...LIST} />);
    const text = container.textContent ?? "";
    expect(text).toContain(LIST.title);
    for (const item of LIST.items) expect(text).toContain(item);
  });
});
