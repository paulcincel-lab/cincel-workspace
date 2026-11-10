/**
 * Stable color per tramo.
 *
 * A tramo has no color column: its slot (1–5) comes from its key for the
 * firm's known tramos, otherwise from its `sortOrder`. The slot maps to one of
 * the theme's chart tokens (`--chart-1` … `--chart-5`); no slot is the neutral
 * gray. Every UI that colors by tramo (badges, charts, legends) goes through
 * this module, so a given tramo looks the same everywhere.
 */

export const TRAMO_COLOR_SLOTS = [1, 2, 3, 4, 5] as const;
export type TramoColorSlot = (typeof TRAMO_COLOR_SLOTS)[number];

type TramoColorInput = { key: string; sortOrder: number };

/** Fixed slot for the firm's known tramos, keyed by workflow key. */
const SLOT_BY_KEY: Record<string, TramoColorSlot> = {
  presale: 1,
  diseno: 2,
  construccion: 3,
  decoracion: 4,
};

/** Tailwind classes per slot. Literal strings so Tailwind picks them up. */
const BG_CLASS: Record<TramoColorSlot, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};
const NEUTRAL_BG_CLASS = "bg-muted-foreground";
const NEUTRAL_VAR = "var(--muted-foreground)";

function isSlot(value: number): value is TramoColorSlot {
  return (TRAMO_COLOR_SLOTS as readonly number[]).includes(value);
}

/** The tramo's chart slot: by known key, else its sortOrder when 1..5, else null. */
export function tramoColorSlot(w: TramoColorInput): TramoColorSlot | null {
  const known = SLOT_BY_KEY[w.key.trim().toLowerCase()];
  if (known) return known;
  return isSlot(w.sortOrder) ? w.sortOrder : null;
}

/** Background class for a tramo's color dot / swatch; null = neutral. */
export function tramoColorClass(w: TramoColorInput | null | undefined): string {
  const slot = w ? tramoColorSlot(w) : null;
  return slot ? BG_CLASS[slot] : NEUTRAL_BG_CLASS;
}

/** CSS color value for charts (fill / stroke); null = neutral. */
export function tramoColorVar(w: TramoColorInput | null | undefined): string {
  const slot = w ? tramoColorSlot(w) : null;
  return slot ? `var(--chart-${slot})` : NEUTRAL_VAR;
}
