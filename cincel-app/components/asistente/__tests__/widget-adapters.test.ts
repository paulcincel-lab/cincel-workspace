import { describe, expect, it } from "vitest";

import { WIDGET_TONE_BADGE_VARIANT, WIDGET_TONE_TO_TONE } from "../tone";
import {
  chartColorVar,
  parseStatNumber,
  toAttentionItems,
  toDistributionSegments,
  toKpiItems,
} from "../widget-adapters";

describe("assistant widget adapters", () => {
  it("cycles the five chart tokens", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(chartColorVar)).toEqual([
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
      "var(--chart-1)",
      "var(--chart-2)",
    ]);
  });

  it("maps chart points to distribution segments with unique keys", () => {
    const segments = toDistributionSegments([
      { label: "A", value: 1 },
      { label: "A", value: 2 },
    ]);
    expect(segments).toEqual([
      { key: "0-A", label: "A", value: 1, colorVar: "var(--chart-1)" },
      { key: "1-A", label: "A", value: 2, colorVar: "var(--chart-2)" },
    ]);
  });

  it.each([
    ["62 %", 62],
    ["$1,250", 1250],
    ["1,234,567", 1234567],
    ["-3.5 días", -3.5],
    ["3 de 8", 3],
    ["sin dato", 0],
  ])("reads the number in %s", (text, expected) => {
    expect(parseStatNumber(text)).toBe(expected);
  });

  it("maps stats to KPI items keeping the original text and the badge label", () => {
    expect(
      toKpiItems([
        { label: "Avance", value: "62 %", badge: { label: "En riesgo", tone: "warning" } },
        { label: "Tareas", value: "12" },
      ]),
    ).toEqual([
      { key: "0-Avance", label: "Avance", value: 62, display: "62 %", caption: "En riesgo" },
      { key: "1-Tareas", label: "Tareas", value: 12, display: "12" },
    ]);
  });

  it("maps list entries to neutral attention items with no task data", () => {
    expect(toAttentionItems(["Planos"])).toEqual([
      {
        id: "0",
        title: "Planos",
        href: "",
        project: "",
        tramo: null,
        reason: "",
        tone: "default",
        assignee: null,
        due: null,
        daysLate: null,
      },
    ]);
  });

  it("maps tool tones onto library tones and plain badge variants", () => {
    expect(WIDGET_TONE_TO_TONE).toEqual({ ok: "ok", warning: "warn", critical: "critical" });
    expect(WIDGET_TONE_BADGE_VARIANT).toEqual({ ok: "success", warning: "secondary", critical: "destructive" });
  });
});
