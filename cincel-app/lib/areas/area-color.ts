/**
 * Stable color per área (department).
 *
 * Each área stores a `color_slot` (1–5) that maps to one of the theme's chart
 * tokens (`--chart-1` … `--chart-5`). A null slot is the neutral gray. Every UI
 * that colors by área (badges, charts, legends) goes through this module, so a
 * given área looks the same everywhere.
 */

export const AREA_COLOR_SLOTS = [1, 2, 3, 4, 5] as const;
export type AreaColorSlot = (typeof AREA_COLOR_SLOTS)[number];

/** Default slot for the firm's known departments, keyed by normalized name. */
const DEFAULT_SLOT_BY_NAME: Record<string, AreaColorSlot> = {
  presale: 1,
  diseno: 2,
  construccion: 3,
  decoracion: 4,
};

/** Tailwind classes per slot. Literal strings so Tailwind picks them up. */
const BG_CLASS: Record<AreaColorSlot, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};
const NEUTRAL_BG_CLASS = "bg-muted-foreground";
const NEUTRAL_VAR = "var(--muted-foreground)";

export function isAreaColorSlot(value: unknown): value is AreaColorSlot {
  return typeof value === "number" && (AREA_COLOR_SLOTS as readonly number[]).includes(value);
}

/** Lowercase, trimmed, accents stripped: "Diseño " → "diseno". */
export function normalizeAreaName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Slot a new área starts with: its department's default when the name is a
 * known one, otherwise the first slot no other área uses, otherwise null
 * (neutral). Never a generated hue.
 */
export function defaultAreaColorSlot(
  name: string,
  takenSlots: Iterable<number | null | undefined> = []
): AreaColorSlot | null {
  const known = DEFAULT_SLOT_BY_NAME[normalizeAreaName(name)];
  if (known) return known;
  const taken = new Set(takenSlots);
  return AREA_COLOR_SLOTS.find((slot) => !taken.has(slot)) ?? null;
}

/** Background class for an área's color dot / swatch. */
export function areaColorClass(slot: number | null | undefined): string {
  return isAreaColorSlot(slot) ? BG_CLASS[slot] : NEUTRAL_BG_CLASS;
}

/** CSS color value for charts (fill / stroke). */
export function areaColorVar(slot: number | null | undefined): string {
  return isAreaColorSlot(slot) ? `var(--chart-${slot})` : NEUTRAL_VAR;
}

/** Label for the color picker. */
export function areaColorLabel(slot: number | null | undefined): string {
  return isAreaColorSlot(slot) ? `Color ${slot}` : "Neutro";
}
