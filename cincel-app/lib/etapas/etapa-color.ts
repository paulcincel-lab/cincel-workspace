/**
 * Stable color per etapa.
 *
 * An etapa's slot (1–5) is its `color_slot` when an admin chose one (Ajustes ›
 * Etapas y fases), else its key for the firm's known etapas, otherwise its
 * `sortOrder`. The slot maps to one of
 * the theme's chart tokens (`--chart-1` … `--chart-5`); no slot is the neutral
 * gray. Every UI that colors by etapa (badges, charts, legends) goes through
 * this module, so a given etapa looks the same everywhere.
 */

export const ETAPA_COLOR_SLOTS = [1, 2, 3, 4, 5] as const;
export type EtapaColorSlot = (typeof ETAPA_COLOR_SLOTS)[number];

type EtapaColorInput = { key: string; sortOrder: number; colorSlot?: number | null };

/** Display name of each slot's color (Ajustes › Etapas y fases). */
export const ETAPA_COLOR_NAMES: Record<EtapaColorSlot, string> = {
  1: "Azul",
  2: "Violeta",
  3: "Ámbar",
  4: "Cian",
  5: "Verde",
};

/** Fixed slot for the firm's known etapas, keyed by workflow key. */
const SLOT_BY_KEY: Record<string, EtapaColorSlot> = {
  presale: 1,
  diseno: 2,
  construccion: 3,
  decoracion: 4,
};

/** Tailwind classes per slot. Literal strings so Tailwind picks them up. */
const BG_CLASS: Record<EtapaColorSlot, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};
const NEUTRAL_BG_CLASS = "bg-muted-foreground";
const NEUTRAL_VAR = "var(--muted-foreground)";

function isSlot(value: number): value is EtapaColorSlot {
  return (ETAPA_COLOR_SLOTS as readonly number[]).includes(value);
}

/** The etapa's chart slot: its explicit `colorSlot`, else by known key, else its sortOrder when 1..5, else null. */
export function etapaColorSlot(w: EtapaColorInput): EtapaColorSlot | null {
  if (typeof w.colorSlot === "number" && isSlot(w.colorSlot)) return w.colorSlot;
  const known = SLOT_BY_KEY[w.key.trim().toLowerCase()];
  if (known) return known;
  return isSlot(w.sortOrder) ? w.sortOrder : null;
}

/** Background class for an etapa's color dot / swatch; null = neutral. */
export function etapaColorClass(w: EtapaColorInput | null | undefined): string {
  const slot = w ? etapaColorSlot(w) : null;
  return slot ? BG_CLASS[slot] : NEUTRAL_BG_CLASS;
}

/** CSS color value for charts (fill / stroke); null = neutral. */
export function etapaColorVar(w: EtapaColorInput | null | undefined): string {
  const slot = w ? etapaColorSlot(w) : null;
  return slot ? `var(--chart-${slot})` : NEUTRAL_VAR;
}
