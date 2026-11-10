/**
 * Token colors of the Visual Resumen widgets, as CSS values for SVG strokes
 * and inline fills: a tramo's color, ink and soft tint (tramo tokens over
 * `chart-*`, soft = `tint-*`), and the load heat of a person (`OCCUPANCY_HEAT`
 * thresholds: ≥ 90 destructive, ≥ 60 warning, else success). Only `var(--…)`
 * tokens; no hex.
 */
import { loadTone } from "@/components/widgets/PeopleWidget";
import { tramoColorSlot } from "@/lib/tramos/tramo-color";
import type { WorkflowRef } from "@/lib/types/core";

export type TramoTone = { color: string; ink: string; soft: string };

const SOFT_BY_SLOT: Record<number, string> = {
  1: "var(--tint-primary)",
  2: "var(--tint-violet)",
  3: "var(--tint-warning)",
  4: "var(--tint-cyan)",
  5: "var(--tint-success)",
};

export const NEUTRAL_TONE: TramoTone = {
  color: "var(--muted-foreground)",
  ink: "var(--foreground)",
  soft: "var(--muted)",
};

/** The tone of a tramo by key (the catalog gives its sortOrder for unknown keys); neutral without one. */
export function tramoTone(key: string | null | undefined, catalog: WorkflowRef[] = []): TramoTone {
  if (!key) return NEUTRAL_TONE;
  const sortOrder = catalog.find((t) => t.key === key)?.sortOrder ?? 0;
  const slot = tramoColorSlot({ key, sortOrder });
  if (!slot) return NEUTRAL_TONE;
  return { color: `var(--chart-${slot})`, ink: `var(--chart-${slot}-ink)`, soft: SOFT_BY_SLOT[slot] ?? "var(--muted)" };
}

export type HeatTone = { color: string; soft: string; className: string };

const HEAT: Record<ReturnType<typeof loadTone>, HeatTone> = {
  critical: { color: "var(--destructive)", soft: "var(--tint-destructive)", className: "text-destructive" },
  warn: { color: "var(--warning)", soft: "var(--tint-warning)", className: "text-warning-ink" },
  ok: { color: "var(--success)", soft: "var(--tint-success)", className: "text-success" },
};

/** Ring and line color of a load percentage. */
export function heatTone(pct: number): HeatTone {
  return HEAT[loadTone(pct)];
}

/** `--ring-offset` of the `ring` utility (circle with `pathLength="100"`) for a percentage. */
export function ringOffset(pct: number): string {
  return String(100 - Math.max(0, Math.min(100, pct)));
}
