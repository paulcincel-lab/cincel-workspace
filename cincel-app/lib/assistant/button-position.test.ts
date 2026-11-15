import { describe, expect, it } from "vitest";

import {
  DEFAULT_BUTTON_POSITION,
  clampPoint,
  exceedsDragThreshold,
  insetsFor,
  nearestSide,
  parsePosition,
  pointForPosition,
  positionForKey,
  snapPosition,
} from "./button-position";

const size = { width: 200, height: 48 };
const desktop = { width: 1280, height: 800 };
const phone = { width: 390, height: 844 };
const dInsets = insetsFor(desktop.width);
const pInsets = insetsFor(phone.width);

describe("drag threshold", () => {
  it("stays a press below 5 px and becomes a drag from 5 px", () => {
    expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 13, y: 12 })).toBe(false);
    expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 15, y: 10 })).toBe(true);
    expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 13, y: 14 })).toBe(true);
  });
});

describe("insets", () => {
  it("clears the sidebar on desktop and the bottom tabs on phones", () => {
    expect(dInsets.left).toBeGreaterThanOrEqual(248);
    expect(pInsets.bottom).toBeGreaterThanOrEqual(80);
  });
  it("adds the safe area", () => {
    expect(insetsFor(390, { top: 47, right: 0, bottom: 34, left: 0 }).bottom).toBe(80 + 34);
  });
});

describe("clamping", () => {
  it("never leaves the viewport", () => {
    const low = clampPoint({ x: -500, y: -500 }, size, desktop, dInsets);
    expect(low).toEqual({ x: dInsets.left, y: dInsets.top });
    const high = clampPoint({ x: 9999, y: 9999 }, size, desktop, dInsets);
    expect(high.x + size.width).toBe(desktop.width - dInsets.right);
    expect(high.y + size.height).toBe(desktop.height - dInsets.bottom);
  });
  it("keeps the button above the phone bottom tabs", () => {
    const p = clampPoint({ x: 0, y: 9999 }, size, phone, pInsets);
    expect(p.y + size.height).toBeLessThanOrEqual(phone.height - 80);
  });
  it("re-clamps a stored position on a smaller viewport", () => {
    const small = { width: 500, height: 400 };
    const p = pointForPosition({ side: "right", y: 0.95 }, size, small, insetsFor(small.width));
    expect(p.y + size.height).toBeLessThanOrEqual(small.height);
    expect(p.x + size.width).toBeLessThanOrEqual(small.width);
  });
  it("puts the default bottom-right", () => {
    const p = pointForPosition(DEFAULT_BUTTON_POSITION, size, desktop, dInsets);
    expect(p).toEqual({ x: desktop.width - dInsets.right - size.width, y: desktop.height - dInsets.bottom - size.height });
  });
});

describe("edge snap", () => {
  it("snaps to the nearest side and keeps the vertical position", () => {
    expect(nearestSide({ x: 300, y: 100 }, size, desktop, dInsets)).toBe("left");
    expect(nearestSide({ x: 900, y: 100 }, size, desktop, dInsets)).toBe("right");
    const snapped = snapPosition({ x: 900, y: 400 }, size, desktop, dInsets);
    expect(snapped.side).toBe("right");
    expect(snapped.y).toBeCloseTo(0.5);
  });
  it("clamps the vertical position when released outside the safe margins", () => {
    const snapped = snapPosition({ x: 10, y: 9999 }, size, phone, pInsets);
    expect(snapped.side).toBe("left");
    expect(snapped.y * phone.height + size.height).toBeLessThanOrEqual(phone.height - 80);
  });
});

describe("keyboard", () => {
  const mid = { side: "right" as const, y: 0.5 };
  it("switches edges with left and right", () => {
    expect(positionForKey("ArrowLeft", mid, size, desktop, dInsets)).toEqual({ side: "left", y: 0.5 });
    expect(positionForKey("ArrowRight", { side: "left", y: 0.5 }, size, desktop, dInsets)?.side).toBe("right");
  });
  it("steps 10 % up and down, bounded", () => {
    expect(positionForKey("ArrowUp", mid, size, desktop, dInsets)?.y).toBeCloseTo(0.4);
    expect(positionForKey("ArrowDown", mid, size, desktop, dInsets)?.y).toBeCloseTo(0.6);
    expect(positionForKey("ArrowUp", { side: "right", y: 0.05 }, size, desktop, dInsets)?.y).toBe(0);
  });
  it("steps from where a clamped bottom-right really is", () => {
    const next = positionForKey("ArrowUp", DEFAULT_BUTTON_POSITION, size, desktop, dInsets);
    const bottom = (desktop.height - dInsets.bottom - size.height) / desktop.height;
    expect(next?.y).toBeCloseTo(bottom - 0.1);
  });
  it("ignores other keys", () => {
    expect(positionForKey("Enter", mid, size, desktop, dInsets)).toBeNull();
  });
});

describe("parsePosition", () => {
  it("accepts a valid value and clamps y", () => {
    expect(parsePosition({ side: "left", y: 0.3 })).toEqual({ side: "left", y: 0.3 });
    expect(parsePosition({ side: "left", y: 7 })).toEqual({ side: "left", y: 1 });
  });
  it("falls back to bottom-right for anything else", () => {
    for (const bad of [null, "x", {}, { side: "top", y: 0.2 }, { side: "left", y: NaN }]) {
      expect(parsePosition(bad)).toEqual(DEFAULT_BUTTON_POSITION);
    }
  });
});
