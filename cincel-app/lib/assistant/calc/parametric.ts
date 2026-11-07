/**
 * Parametric cost estimate (redesign BE §10.3 `parametric_cost_estimate`,
 * Annex C5): the org cost table lives in `app_settings('parametric_costs')`,
 * versioned like `general_settings` (`{ version: 1, data }`). There is no
 * editor in this feature, so the key is empty by default and the tool
 * explains it is not configured. Pure (parsing and arithmetic only).
 */
import { z } from "zod";

export const PARAMETRIC_COSTS_KEY = "parametric_costs";

export const FINISH_LEVELS = ["economico", "medio", "alto"] as const;
export type FinishLevel = (typeof FINISH_LEVELS)[number];

export const FINISH_LABELS: Record<FinishLevel, string> = { economico: "económico", medio: "medio", alto: "alto" };

const CostRowSchema = z.object({
  /** Use of the building, e.g. "vivienda", "oficina", "local comercial". */
  use: z.string().trim().min(1),
  finishLevel: z.enum(FINISH_LEVELS),
  /** MXN per m² of built area. */
  costPerM2: z.number().positive(),
});

export const ParametricCostsSchema = z.object({
  version: z.literal(1),
  data: z.object({
    /** Optional reference date or source of the table, shown with the estimate. */
    source: z.string().trim().min(1).optional(),
    rows: z.array(CostRowSchema),
  }),
});

export type ParametricCosts = z.infer<typeof ParametricCostsSchema>["data"];

/** The stored table, or null when the key is empty, unreadable or has no rows. */
export function parseParametricCosts(raw: string | null | undefined): ParametricCosts | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = ParametricCostsSchema.safeParse(json);
  if (!parsed.success || parsed.data.data.rows.length === 0) return null;
  return parsed.data.data;
}

function key(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type ParametricEstimate =
  | {
      ok: true;
      use: string;
      finishLevel: FinishLevel;
      area: number;
      costPerM2: number;
      total: number;
      source: string | null;
    }
  | { ok: false; error: "UNKNOWN_USE" | "UNKNOWN_FINISH"; message: string; uses: string[] };

/** `area × costPerM2` of the row matching `use` (accent and case insensitive, exact before partial). */
export function estimateParametricCost(
  table: ParametricCosts,
  input: { area: number; use: string; finishLevel: FinishLevel },
): ParametricEstimate {
  const uses = [...new Set(table.rows.map((row) => row.use))];
  const wanted = key(input.use);
  const exact = table.rows.filter((row) => key(row.use) === wanted);
  const candidates = exact.length > 0 ? exact : table.rows.filter((row) => key(row.use).includes(wanted) || wanted.includes(key(row.use)));
  const useNames = [...new Set(candidates.map((row) => row.use))];
  if (useNames.length !== 1) {
    return {
      ok: false,
      error: "UNKNOWN_USE",
      message:
        useNames.length === 0
          ? `La tabla de costos no tiene el uso "${input.use}". Usos configurados: ${uses.join(", ")}.`
          : `"${input.use}" coincide con varios usos: ${useNames.join(", ")}. Indica uno.`,
      uses,
    };
  }
  const row = candidates.find((r) => r.finishLevel === input.finishLevel);
  if (!row) {
    const levels = candidates.map((r) => FINISH_LABELS[r.finishLevel]).join(", ");
    return {
      ok: false,
      error: "UNKNOWN_FINISH",
      message: `La tabla de costos no tiene el nivel ${FINISH_LABELS[input.finishLevel]} para ${useNames[0]}. Niveles configurados: ${levels}.`,
      uses,
    };
  }
  return {
    ok: true,
    use: row.use,
    finishLevel: row.finishLevel,
    area: input.area,
    costPerM2: row.costPerM2,
    total: Math.round(input.area * row.costPerM2 * 100) / 100,
    source: table.source ?? null,
  };
}
