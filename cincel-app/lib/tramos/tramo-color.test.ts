// @vitest-environment node
import { describe, expect, it } from "vitest";

import { tramoColorClass, tramoColorSlot, tramoColorVar } from "./tramo-color";

describe("tramoColorSlot", () => {
  it("keeps the fixed slot of the known tramos, whatever their order", () => {
    expect(tramoColorSlot({ key: "presale", sortOrder: 4 })).toBe(1);
    expect(tramoColorSlot({ key: "diseno", sortOrder: 1 })).toBe(2);
    expect(tramoColorSlot({ key: "construccion", sortOrder: 5 })).toBe(3);
  });

  it("decoracion maps to slot 4", () => {
    expect(tramoColorSlot({ key: "decoracion", sortOrder: 4 })).toBe(4);
    expect(tramoColorSlot({ key: "decoracion", sortOrder: 0 })).toBe(4);
    expect(tramoColorSlot({ key: "Decoracion ", sortOrder: 9 })).toBe(4);
    expect(tramoColorVar({ key: "decoracion", sortOrder: 1 })).toBe("var(--chart-4)");
  });

  it("uses sortOrder 1..5 for any other tramo", () => {
    expect(tramoColorSlot({ key: "otro", sortOrder: 5 })).toBe(5);
    expect(tramoColorSlot({ key: "otro", sortOrder: 1 })).toBe(1);
  });

  it("is null (neutral) outside 1..5", () => {
    expect(tramoColorSlot({ key: "otro", sortOrder: 0 })).toBeNull();
    expect(tramoColorSlot({ key: "otro", sortOrder: 6 })).toBeNull();
    expect(tramoColorSlot({ key: "otro", sortOrder: 2.5 })).toBeNull();
  });
});

describe("tramoColorClass / tramoColorVar", () => {
  it("map the slot to its chart token", () => {
    expect(tramoColorClass({ key: "diseno", sortOrder: 2 })).toBe("bg-chart-2");
    expect(tramoColorVar({ key: "presale", sortOrder: 1 })).toBe("var(--chart-1)");
    expect(tramoColorVar({ key: "otro", sortOrder: 5 })).toBe("var(--chart-5)");
  });

  it("fall back to neutral without a tramo or a slot", () => {
    expect(tramoColorClass(null)).toBe("bg-muted-foreground");
    expect(tramoColorVar(undefined)).toBe("var(--muted-foreground)");
    expect(tramoColorVar({ key: "otro", sortOrder: 9 })).toBe("var(--muted-foreground)");
  });
});

describe("tramoColorSlot with an explicit color_slot", () => {
  it("explicit slot wins over key and sortOrder", () => {
    expect(tramoColorSlot({ key: "presale", sortOrder: 1, colorSlot: 5 })).toBe(5);
    expect(tramoColorSlot({ key: "otro", sortOrder: 2, colorSlot: 4 })).toBe(4);
    expect(tramoColorVar({ key: "diseno", sortOrder: 2, colorSlot: 3 })).toBe("var(--chart-3)");
    expect(tramoColorClass({ key: "construccion", sortOrder: 3, colorSlot: 1 })).toBe("bg-chart-1");
  });

  it("falls back to the key / sortOrder rule without a valid slot", () => {
    expect(tramoColorSlot({ key: "presale", sortOrder: 4, colorSlot: null })).toBe(1);
    expect(tramoColorSlot({ key: "otro", sortOrder: 2, colorSlot: 9 })).toBe(2);
  });
});
