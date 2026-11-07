/**
 * Quantity takeoff calculator (redesign BE §10.3 `quantity_takeoff`): pieces /
 * boxes / sacks for a material over an area, with waste (default 10 %). Pure.
 *
 * Rules table, first match wins:
 *
 * | Rule  | Format                                   | Quantity                                        |
 * |-------|------------------------------------------|-------------------------------------------------|
 * | caja  | "caja de 1.44 m²", "caja 2 m2"           | area / m² per box                               |
 * | saco  | "saco 20 kg", "bulto de 50kg", "20 kg"   | area × kg per m² (material yield) / kg per sack |
 * | saco  | "saco" / "bulto" with a known material   | same, with the material's usual sack size       |
 * | pieza | "60x60 cm", "12x20x40", "122x244"        | area / face of one piece (+ joint for masonry)  |
 *
 * `quantity` is the exact need rounded up to whole units; `withWaste` adds
 * the waste percentage before rounding up.
 */

export type TakeoffInput = { material: string; area: number; format: string; wastePct?: number };

export type TakeoffRule = "pieza" | "caja" | "saco";

export type TakeoffResult = {
  unit: string;
  quantity: number;
  withWaste: number;
  notes: string[];
  rule: TakeoffRule;
  wastePct: number;
};

export const DEFAULT_WASTE_PCT = 10;

/** A takeoff the calculator can't compute; `userMessage` is Spanish copy for the user. */
export class TakeoffError extends Error {
  readonly userMessage: string;

  constructor(message: string) {
    super(`INVALID: ${message}`);
    this.name = "TakeoffError";
    this.userMessage = message;
  }
}

/** Sack materials: yield in kg per m² (usual application) and the usual sack size. */
export type SackMaterial = { keys: string[]; label: string; kgPerM2: number; sackKg: number; basis: string };

export const SACK_MATERIALS: readonly SackMaterial[] = [
  {
    keys: ["pegazulejo", "pega azulejo", "adhesivo", "pegapiso", "pega piso"],
    label: "adhesivo para piso y azulejo",
    kgPerM2: 5,
    sackKg: 20,
    basis: "llana dentada de 6 mm",
  },
  { keys: ["boquilla", "junteador", "emboquillador"], label: "boquilla", kgPerM2: 0.5, sackKg: 5, basis: "junta de 3 mm" },
  { keys: ["yeso"], label: "yeso", kgPerM2: 10, sackKg: 40, basis: "1 cm de espesor" },
  {
    keys: ["mortero", "aplanado", "repellado"],
    label: "mortero premezclado",
    kgPerM2: 20,
    sackKg: 50,
    basis: "1 cm de espesor",
  },
  { keys: ["pasta", "estuco", "resanador"], label: "pasta / estuco", kgPerM2: 1.5, sackKg: 25, basis: "dos manos" },
  { keys: ["autonivelante", "nivelador"], label: "mortero autonivelante", kgPerM2: 8, sackKg: 25, basis: "5 mm de espesor" },
];

/** Masonry pieces are laid with a mortar joint; tiles and boards are counted without one. */
const MASONRY = ["block", "bloque", "tabique", "ladrillo", "tabicon", "adoquin"];
/** Bricks show their shortest × longest side (laid "a soga"); blocks their two largest. */
const BRICK = ["tabique", "ladrillo"];
export const MASONRY_JOINT_CM = 1;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function num(raw: string): number {
  return Number(raw.replace(",", "."));
}

function includesAny(text: string, keys: readonly string[]): boolean {
  return keys.some((key) => text.includes(normalize(key)));
}

function sackMaterialOf(text: string): SackMaterial | null {
  return SACK_MATERIALS.find((entry) => includesAny(text, entry.keys)) ?? null;
}

const NUMBER = "(\\d+(?:[.,]\\d+)?)";
const BOX_RE = new RegExp(`caja[^\\d]*${NUMBER}\\s*(?:m2|m²|m\\^2|mts2|metros)`);
const SACK_RE = new RegExp(`${NUMBER}\\s*(?:kg|kilos?)\\b`);
const SACK_WORD_RE = /\b(saco|sacos|bulto|bultos|costal|costales)\b/;
const DIMS_RE = new RegExp(`${NUMBER}\\s*[x×*]\\s*${NUMBER}(?:\\s*[x×*]\\s*${NUMBER})?\\s*(mm|cm|m)?\\b`);

function toCm(value: number, unit: string | undefined): number {
  if (unit === "mm") return value / 10;
  if (unit === "m") return value * 100;
  return value;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Rounds up, tolerating float noise (e.g. 25.000000001 → 25). */
function ceilUnits(value: number): number {
  return Math.ceil(Math.round(value * 1e6) / 1e6);
}

function validate(input: TakeoffInput): { area: number; wastePct: number; material: string; format: string } {
  const area = Number(input.area);
  if (!Number.isFinite(area) || area <= 0) throw new TakeoffError("El área debe ser un número mayor que cero (m²).");
  const wastePct = input.wastePct === undefined || input.wastePct === null ? DEFAULT_WASTE_PCT : Number(input.wastePct);
  if (!Number.isFinite(wastePct) || wastePct < 0 || wastePct > 100) {
    throw new TakeoffError("El desperdicio debe estar entre 0 y 100 %.");
  }
  return { area, wastePct, material: normalize(input.material ?? ""), format: normalize(input.format ?? "") };
}

function result(rule: TakeoffRule, unit: [string, string], exact: number, wastePct: number, notes: string[]): TakeoffResult {
  const quantity = ceilUnits(exact);
  const withWaste = ceilUnits(exact * (1 + wastePct / 100));
  return {
    rule,
    unit: withWaste === 1 ? unit[0] : unit[1],
    quantity,
    withWaste,
    wastePct,
    notes: [...notes, `La cantidad a comprar incluye ${wastePct} % de desperdicio.`],
  };
}

export function quantityTakeoff(input: TakeoffInput): TakeoffResult {
  const { area, wastePct, material, format } = validate(input);

  // 1. Box: "caja de 1.44 m²".
  const box = BOX_RE.exec(format);
  if (box) {
    const perBox = num(box[1]);
    if (!(perBox > 0)) throw new TakeoffError("La caja debe cubrir más de 0 m².");
    return result("caja", ["caja", "cajas"], area / perBox, wastePct, [
      `Cada caja rinde ${round2(perBox)} m²: ${round2(area)} m² ÷ ${round2(perBox)} m².`,
    ]);
  }

  // 2. Sack: an explicit weight, or the word saco/bulto with a known material.
  const sackMaterial = sackMaterialOf(material) ?? sackMaterialOf(format);
  const sackWeight = SACK_RE.exec(format);
  if (sackWeight || (SACK_WORD_RE.test(format) && sackMaterial)) {
    if (!sackMaterial) {
      throw new TakeoffError(
        `No conozco el rendimiento por m² de "${input.material}". Materiales por saco: ${SACK_MATERIALS.map((m) => m.label).join(", ")}.`,
      );
    }
    const sackKg = sackWeight ? num(sackWeight[1]) : sackMaterial.sackKg;
    if (!(sackKg > 0)) throw new TakeoffError("El saco debe pesar más de 0 kg.");
    const kg = area * sackMaterial.kgPerM2;
    return result("saco", ["saco", "sacos"], kg / sackKg, wastePct, [
      `Rendimiento de ${sackMaterial.label}: ${sackMaterial.kgPerM2} kg/m² (${sackMaterial.basis}); ${round2(kg)} kg en total.`,
      `Saco de ${round2(sackKg)} kg${sackWeight ? "" : " (presentación usual)"}.`,
    ]);
  }

  // 3. Piece: "60x60 cm", "12x20x40", "122x244".
  const dims = DIMS_RE.exec(format);
  if (dims) {
    const unit = dims[4];
    const sides = [dims[1], dims[2], dims[3]]
      .filter((d): d is string => d !== undefined)
      .map((d) => toCm(num(d), unit))
      .sort((x, y) => x - y);
    if (sides.some((s) => !(s > 0))) throw new TakeoffError("Las medidas de la pieza deben ser mayores que cero.");
    const [a, b] =
      sides.length === 3 ? (includesAny(material, BRICK) ? [sides[0], sides[2]] : [sides[1], sides[2]]) : [sides[0], sides[1]];
    const masonry = includesAny(material, MASONRY);
    const joint = masonry ? MASONRY_JOINT_CM : 0;
    const faceM2 = ((a + joint) * (b + joint)) / 10_000;
    const perM2 = 1 / faceM2;
    return result("pieza", ["pieza", "piezas"], area * perM2, wastePct, [
      `Cara de la pieza: ${round2(a)} × ${round2(b)} cm${masonry ? ` más ${MASONRY_JOINT_CM} cm de junta` : ""}; ${round2(perM2)} piezas por m².`,
    ]);
  }

  throw new TakeoffError(
    'No reconozco el formato. Usa las medidas de la pieza ("60x60 cm", "12x20x40"), una caja ("caja de 1.44 m²") o un saco ("saco 20 kg").',
  );
}
