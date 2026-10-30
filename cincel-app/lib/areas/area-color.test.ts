// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  areaColorClass,
  areaColorLabel,
  areaColorVar,
  defaultAreaColorSlot,
  isAreaColorSlot,
  normalizeAreaName,
} from "./area-color";

describe("area color", () => {
  it("gives the known departments their fixed slot", () => {
    expect(defaultAreaColorSlot("Presale")).toBe(1);
    expect(defaultAreaColorSlot("Diseño")).toBe(2);
    expect(defaultAreaColorSlot("construcción")).toBe(3);
    expect(defaultAreaColorSlot(" DECORACIÓN ")).toBe(4);
  });

  it("keeps a known department's slot even when another área uses it", () => {
    expect(defaultAreaColorSlot("Presale", [1, 2, 3])).toBe(1);
  });

  it("gives any other área the next free slot", () => {
    expect(defaultAreaColorSlot("Dirección", [1, 2, 3])).toBe(4);
    expect(defaultAreaColorSlot("Ejecutivo", [1, 2, 3, 4, null])).toBe(5);
    expect(defaultAreaColorSlot("Compras", [2, 3])).toBe(1);
  });

  it("falls back to neutral when every slot is taken", () => {
    expect(defaultAreaColorSlot("Sexta", [1, 2, 3, 4, 5])).toBeNull();
  });

  it("maps a slot to the same chart token every time", () => {
    expect(areaColorClass(1)).toBe("bg-chart-1");
    expect(areaColorClass(5)).toBe("bg-chart-5");
    expect(areaColorClass(3)).toBe(areaColorClass(3));
    expect(areaColorVar(2)).toBe("var(--chart-2)");
    expect(areaColorLabel(4)).toBe("Color 4");
  });

  it("uses the neutral gray for no slot or an out-of-range slot", () => {
    for (const slot of [null, undefined, 0, 6, 2.5]) {
      expect(areaColorClass(slot)).toBe("bg-muted-foreground");
      expect(areaColorVar(slot)).toBe("var(--muted-foreground)");
      expect(areaColorLabel(slot)).toBe("Neutro");
      expect(isAreaColorSlot(slot)).toBe(false);
    }
  });

  it("normalizes names for matching", () => {
    expect(normalizeAreaName("  Diseño ")).toBe("diseno");
  });
});
