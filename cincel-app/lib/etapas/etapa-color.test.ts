// @vitest-environment node
import { describe, expect, it } from "vitest";

import { etapaColorClass, etapaColorSlot, etapaColorVar } from "./etapa-color";

describe("etapaColorSlot", () => {
  it("keeps the fixed slot of the known etapas, whatever their order", () => {
    expect(etapaColorSlot({ key: "presale", sortOrder: 4 })).toBe(1);
    expect(etapaColorSlot({ key: "diseno", sortOrder: 1 })).toBe(2);
    expect(etapaColorSlot({ key: "construccion", sortOrder: 5 })).toBe(3);
  });

  it("decoracion maps to slot 4", () => {
    expect(etapaColorSlot({ key: "decoracion", sortOrder: 4 })).toBe(4);
    expect(etapaColorSlot({ key: "decoracion", sortOrder: 0 })).toBe(4);
    expect(etapaColorSlot({ key: "Decoracion ", sortOrder: 9 })).toBe(4);
    expect(etapaColorVar({ key: "decoracion", sortOrder: 1 })).toBe("var(--chart-4)");
  });

  it("uses sortOrder 1..5 for any other etapa", () => {
    expect(etapaColorSlot({ key: "otro", sortOrder: 5 })).toBe(5);
    expect(etapaColorSlot({ key: "otro", sortOrder: 1 })).toBe(1);
  });

  it("is null (neutral) outside 1..5", () => {
    expect(etapaColorSlot({ key: "otro", sortOrder: 0 })).toBeNull();
    expect(etapaColorSlot({ key: "otro", sortOrder: 6 })).toBeNull();
    expect(etapaColorSlot({ key: "otro", sortOrder: 2.5 })).toBeNull();
  });
});

describe("etapaColorClass / etapaColorVar", () => {
  it("map the slot to its chart token", () => {
    expect(etapaColorClass({ key: "diseno", sortOrder: 2 })).toBe("bg-chart-2");
    expect(etapaColorVar({ key: "presale", sortOrder: 1 })).toBe("var(--chart-1)");
    expect(etapaColorVar({ key: "otro", sortOrder: 5 })).toBe("var(--chart-5)");
  });

  it("fall back to neutral without an etapa or a slot", () => {
    expect(etapaColorClass(null)).toBe("bg-muted-foreground");
    expect(etapaColorVar(undefined)).toBe("var(--muted-foreground)");
    expect(etapaColorVar({ key: "otro", sortOrder: 9 })).toBe("var(--muted-foreground)");
  });
});

describe("etapaColorSlot with an explicit color_slot", () => {
  it("explicit slot wins over key and sortOrder", () => {
    expect(etapaColorSlot({ key: "presale", sortOrder: 1, colorSlot: 5 })).toBe(5);
    expect(etapaColorSlot({ key: "otro", sortOrder: 2, colorSlot: 4 })).toBe(4);
    expect(etapaColorVar({ key: "diseno", sortOrder: 2, colorSlot: 3 })).toBe("var(--chart-3)");
    expect(etapaColorClass({ key: "construccion", sortOrder: 3, colorSlot: 1 })).toBe("bg-chart-1");
  });

  it("falls back to the key / sortOrder rule without a valid slot", () => {
    expect(etapaColorSlot({ key: "presale", sortOrder: 4, colorSlot: null })).toBe(1);
    expect(etapaColorSlot({ key: "otro", sortOrder: 2, colorSlot: 9 })).toBe(2);
  });
});
