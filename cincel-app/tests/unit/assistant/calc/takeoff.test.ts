import { describe, expect, it } from "vitest";

import { DEFAULT_WASTE_PCT, quantityTakeoff, TakeoffError, type TakeoffInput } from "@/lib/assistant/calc/takeoff";

type Case = {
  name: string;
  input: TakeoffInput;
  rule: "pieza" | "caja" | "saco";
  unit: string;
  quantity: number;
  withWaste: number;
};

const CASES: Case[] = [
  // Pieces: area / face of one piece.
  { name: "loseta 60x60 cm, default waste", input: { material: "loseta porcelánica", area: 20, format: "60x60 cm" }, rule: "pieza", unit: "piezas", quantity: 56, withWaste: 62 },
  { name: "same tile in mm", input: { material: "loseta", area: 20, format: "600 x 600 mm" }, rule: "pieza", unit: "piezas", quantity: 56, withWaste: 62 },
  { name: "tablaroca 122x244 (no joint)", input: { material: "tablaroca", area: 30, format: "122x244" }, rule: "pieza", unit: "piezas", quantity: 11, withWaste: 12 },
  { name: "board in metres, exact division", input: { material: "panel", area: 28.8, format: "1.2x2.4 m", wastePct: 0 }, rule: "pieza", unit: "piezas", quantity: 10, withWaste: 10 },
  { name: "block 12x20x40 shows 20x40 + 1 cm joint", input: { material: "block de concreto", area: 10, format: "12x20x40", wastePct: 5 }, rule: "pieza", unit: "piezas", quantity: 117, withWaste: 122 },
  { name: "tabique 7x14x28 laid a soga (7x28 + joint)", input: { material: "tabique rojo", area: 10, format: "7x14x28 cm", wastePct: 0 }, rule: "pieza", unit: "piezas", quantity: 432, withWaste: 432 },
  { name: "a single piece is singular", input: { material: "loseta", area: 0.3, format: "60x60", wastePct: 0 }, rule: "pieza", unit: "pieza", quantity: 1, withWaste: 1 },
  // Boxes: area / m² per box.
  { name: "caja de 1.44 m²", input: { material: "piso cerámico", area: 30, format: "caja de 1.44 m²" }, rule: "caja", unit: "cajas", quantity: 21, withWaste: 23 },
  { name: "caja 2 m2 without waste", input: { material: "piso laminado", area: 10, format: "caja 2 m2", wastePct: 0 }, rule: "caja", unit: "cajas", quantity: 5, withWaste: 5 },
  { name: "box rule wins over piece size", input: { material: "loseta", area: 14.4, format: "60x60 caja de 1,44 m2", wastePct: 0 }, rule: "caja", unit: "cajas", quantity: 10, withWaste: 10 },
  // Sacks: area × kg/m² / kg per sack.
  { name: "pegazulejo saco 20 kg (5 kg/m²)", input: { material: "pegazulejo", area: 40, format: "saco 20 kg" }, rule: "saco", unit: "sacos", quantity: 10, withWaste: 11 },
  { name: "yeso bulto, usual 40 kg sack (10 kg/m²)", input: { material: "yeso", area: 50, format: "bulto" }, rule: "saco", unit: "sacos", quantity: 13, withWaste: 14 },
  { name: "mortero bulto de 50kg, waste override 20 %", input: { material: "mortero", area: 25, format: "bulto de 50kg", wastePct: 20 }, rule: "saco", unit: "sacos", quantity: 10, withWaste: 12 },
  { name: "boquilla 5 kg (0.5 kg/m²)", input: { material: "boquilla sin arena", area: 30, format: "5 kg", wastePct: 0 }, rule: "saco", unit: "sacos", quantity: 3, withWaste: 3 },
];

describe("quantityTakeoff", () => {
  it.each(CASES)("$name", ({ input, rule, unit, quantity, withWaste }) => {
    const result = quantityTakeoff(input);
    expect(result.rule).toBe(rule);
    expect(result.unit).toBe(unit);
    expect(result.quantity).toBe(quantity);
    expect(result.withWaste).toBe(withWaste);
    expect(result.wastePct).toBe(input.wastePct ?? DEFAULT_WASTE_PCT);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("defaults the waste to 10 %", () => {
    expect(DEFAULT_WASTE_PCT).toBe(10);
    const withDefault = quantityTakeoff({ material: "loseta", area: 100, format: "50x50 cm" });
    const explicit = quantityTakeoff({ material: "loseta", area: 100, format: "50x50 cm", wastePct: 10 });
    expect(withDefault).toEqual(explicit);
    expect(withDefault.quantity).toBe(400);
    expect(withDefault.withWaste).toBe(440);
  });

  it("applies a waste override", () => {
    const none = quantityTakeoff({ material: "loseta", area: 100, format: "50x50 cm", wastePct: 0 });
    const high = quantityTakeoff({ material: "loseta", area: 100, format: "50x50 cm", wastePct: 25 });
    expect(none.withWaste).toBe(400);
    expect(high.withWaste).toBe(500);
    expect(high.notes.at(-1)).toContain("25 %");
  });

  it.each([
    { name: "unknown format", input: { material: "pintura", area: 10, format: "cubeta" } },
    { name: "zero area", input: { material: "loseta", area: 0, format: "60x60" } },
    { name: "negative waste", input: { material: "loseta", area: 10, format: "60x60", wastePct: -1 } },
    { name: "waste over 100 %", input: { material: "loseta", area: 10, format: "60x60", wastePct: 150 } },
    { name: "sack of a material without a known yield", input: { material: "loseta", area: 10, format: "saco 20 kg" } },
    { name: "empty box", input: { material: "piso", area: 10, format: "caja de 0 m2" } },
  ])("rejects $name with Spanish copy", ({ input }) => {
    let error: unknown;
    try {
      quantityTakeoff(input);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(TakeoffError);
    expect((error as TakeoffError).message.startsWith("INVALID")).toBe(true);
    expect((error as TakeoffError).userMessage).toMatch(/[a-záéíóúñ]/i);
  });
});
