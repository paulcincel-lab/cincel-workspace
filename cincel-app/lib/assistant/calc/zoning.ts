/**
 * Zoning check (redesign BE §10.3 `zoning_check`): compares the project's
 * ficha values (niveles, área libre, altura, cajones) with the zoning limits
 * stored in the same ficha. Missing values never fail the check: they are
 * listed so the user knows what to fill in. Pure.
 */

export type ZoningFicha = {
  /** Proposed levels. */
  levels: number | null;
  /** Maximum levels allowed by zoning. */
  maxLevels: number | null;
  /** Proposed open area, % of the lot. */
  openAreaPct: number | null;
  /** Minimum open area required by zoning, % of the lot. */
  minOpenAreaPct: number | null;
  /** Proposed height, m. */
  heightM: number | null;
  /** Maximum height allowed by zoning, m. */
  maxHeightM: number | null;
  /** Proposed parking spaces. */
  parkingSpaces: number | null;
  /** Parking spaces required by zoning. */
  requiredParkingSpaces: number | null;
};

export const EMPTY_ZONING_FICHA: ZoningFicha = {
  levels: null,
  maxLevels: null,
  openAreaPct: null,
  minOpenAreaPct: null,
  heightM: null,
  maxHeightM: null,
  parkingSpaces: null,
  requiredParkingSpaces: null,
};

export type ZoningCheckRow = {
  criterio: string;
  proyecto: number | null;
  normativa: number | null;
  /** "cumple" / "no cumple" / "faltan datos". */
  resultado: "cumple" | "no cumple" | "faltan datos";
};

export type ZoningCheck = {
  rows: ZoningCheckRow[];
  /** Ficha fields to fill in, in Spanish. */
  missing: string[];
  /** Criteria that fail with the data present. */
  failing: string[];
  complete: boolean;
};

type Criterion = {
  label: string;
  value: keyof ZoningFicha;
  limit: keyof ZoningFicha;
  valueLabel: string;
  limitLabel: string;
  /** "max": value ≤ limit; "min": value ≥ limit. */
  kind: "max" | "min";
};

const CRITERIA: readonly Criterion[] = [
  { label: "Niveles", value: "levels", limit: "maxLevels", valueLabel: "Niveles del proyecto", limitLabel: "Niveles permitidos (zonificación)", kind: "max" },
  { label: "Área libre (%)", value: "openAreaPct", limit: "minOpenAreaPct", valueLabel: "Área libre del proyecto (%)", limitLabel: "Área libre mínima (zonificación, %)", kind: "min" },
  { label: "Altura (m)", value: "heightM", limit: "maxHeightM", valueLabel: "Altura del proyecto (m)", limitLabel: "Altura máxima (zonificación, m)", kind: "max" },
  { label: "Cajones de estacionamiento", value: "parkingSpaces", limit: "requiredParkingSpaces", valueLabel: "Cajones del proyecto", limitLabel: "Cajones requeridos (zonificación)", kind: "min" },
];

function present(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function zoningCheck(ficha: Partial<ZoningFicha>): ZoningCheck {
  const missing: string[] = [];
  const failing: string[] = [];
  const rows = CRITERIA.map((c): ZoningCheckRow => {
    const value = ficha[c.value];
    const limit = ficha[c.limit];
    if (!present(value)) missing.push(c.valueLabel);
    if (!present(limit)) missing.push(c.limitLabel);
    if (!present(value) || !present(limit)) {
      return { criterio: c.label, proyecto: present(value) ? value : null, normativa: present(limit) ? limit : null, resultado: "faltan datos" };
    }
    const ok = c.kind === "max" ? value <= limit : value >= limit;
    if (!ok) failing.push(c.label);
    return { criterio: c.label, proyecto: value, normativa: limit, resultado: ok ? "cumple" : "no cumple" };
  });
  return { rows, missing, failing, complete: missing.length === 0 };
}
