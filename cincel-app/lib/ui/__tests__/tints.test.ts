import { describe, expect, it } from "vitest";

import {
  chartTintCss,
  compositeOver,
  mixOklab,
  mixTint,
  mixTintColor,
  NOTE_COLOR_TOKEN,
  parseColor,
  requireColor,
  TINT_PERCENT,
  toHex,
} from "@/lib/ui/tints";

describe("parseColor", () => {
  it("accepts #rgb, #rrggbb, #rrggbbaa and rgba(r,g,b,a)", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#2563eb")).toEqual({ r: 37, g: 99, b: 235, a: 1 });
    expect(parseColor("#2563EB80")).toEqual({ r: 37, g: 99, b: 235, a: 128 / 255 });
    expect(parseColor("rgba(255,255,255,0.14)")).toEqual({ r: 255, g: 255, b: 255, a: 0.14 });
    expect(parseColor("rgba( 15, 23, 42, .5 )")).toEqual({ r: 15, g: 23, b: 42, a: 0.5 });
  });

  it("rejects anything else", () => {
    for (const bad of ["blue", "#12", "#12345", "#ggg", "rgba(256,0,0,1)", "rgba(0,0,0,2)", "hsl(0 0% 0%)", ""]) {
      expect(parseColor(bad), bad).toBeNull();
    }
    expect(() => requireColor("blue")).toThrow("INVALID: blue");
  });
});

describe("toHex and compositeOver", () => {
  it("round-trips hex and keeps alpha only when translucent", () => {
    expect(toHex(parseColor("#0f172a")!)).toBe("#0f172a");
    expect(toHex(parseColor("#0f172a80")!)).toBe("#0f172a80");
  });

  it("composites rgba over an opaque background", () => {
    const over = compositeOver(parseColor("rgba(255,255,255,0.14)")!, parseColor("#1e1e1e")!);
    expect(over.a).toBe(1);
    expect(toHex(over)).toBe("#3e3e3e");
    expect(toHex(compositeOver(parseColor("rgba(0,0,0,0.5)")!, parseColor("#ffffff")!))).toBe("#808080");
  });
});

describe("oklab mixing", () => {
  it("0 % and 100 % return the endpoints", () => {
    const a = parseColor("#3b82f6")!;
    const b = parseColor("#ffffff")!;
    expect(toHex(mixOklab(a, b, 100))).toBe("#3b82f6");
    expect(toHex(mixOklab(a, b, 0))).toBe("#ffffff");
  });

  it("mixes black and white at the oklab midpoint (L = 0.5), not the sRGB midpoint", () => {
    // oklab L 0.5 is #636363; a naive sRGB mix would give #808080.
    expect(mixTint("#000000", "#ffffff", "light")).not.toBe("#808080");
    expect(toHex(mixOklab(parseColor("#000")!, parseColor("#fff")!, 50))).toBe("#636363");
  });

  it("uses 14 % in light mode and 22 % in dark mode", () => {
    expect(TINT_PERCENT).toEqual({ light: 14, dark: 22 });
    const chart = "#3b82f6";
    const card = "#ffffff";
    expect(mixTint(chart, card, "light")).toBe(toHex(mixOklab(parseColor(chart)!, parseColor(card)!, 14)));
    expect(mixTint(chart, "#1a1e24", "dark")).toBe(toHex(mixOklab(parseColor(chart)!, parseColor("#1a1e24")!, 22)));
  });

  it("a light tint stays close to the card and keeps the chart hue", () => {
    const tint = mixTintColor("#3b82f6", "#ffffff", "light");
    expect(tint.a).toBe(1);
    expect(tint.b).toBeGreaterThan(tint.r);
    expect(tint.r).toBeGreaterThan(220);
  });

  it("mixes alpha premultiplied", () => {
    const mixed = mixOklab(parseColor("#ff000000")!, parseColor("#0000ff")!, 50);
    expect(mixed.a).toBeCloseTo(0.5, 6);
    // The transparent side contributes no color.
    expect(toHex({ ...mixed, a: 1 })).toBe("#0000ff");
  });
});

describe("chartTintCss", () => {
  it("emits the FE §14.5 color-mix per slot and mode", () => {
    expect(chartTintCss(1, "light")).toBe("color-mix(in oklab, var(--chart-1) 14%, var(--card))");
    expect(chartTintCss(5, "dark")).toBe("color-mix(in oklab, var(--chart-5) 22%, var(--card))");
  });
});

describe("NOTE_COLOR_TOKEN", () => {
  it("maps note colors to tokens", () => {
    expect(NOTE_COLOR_TOKEN).toEqual({
      neutral: "muted",
      blue: "chart-1",
      violet: "chart-2",
      amber: "chart-3",
      cyan: "chart-4",
    });
  });
});
