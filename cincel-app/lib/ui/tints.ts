/**
 * Tint utilities (redesign FE §14.5): `chart-N-tint` =
 * `color-mix(in oklab, var(--chart-N) 14%, var(--card))` in light mode and
 * 22 % in dark mode. Text on a tint uses `chart-N-ink`. The same formula is
 * evaluated by `lib/ui/contrast.ts`.
 */
import { notImplemented } from "@/lib/stubs";

export type ChartSlot = 1 | 2 | 3 | 4 | 5;

/** Mix percentage of a chart color into `card`, per mode. */
export const TINT_PERCENT = { light: 14, dark: 22 } as const;

/** Note colors → token (FE §14.5): neutral → muted, blue → chart-1, violet → chart-2, amber → chart-3, cyan → chart-4. */
export const NOTE_COLOR_TOKEN = {
  neutral: "muted",
  blue: "chart-1",
  violet: "chart-2",
  amber: "chart-3",
  cyan: "chart-4",
} as const;

/** CSS `color-mix(...)` for the tint of a chart slot in one mode. */
export function chartTintCss(slot: ChartSlot, mode: "light" | "dark"): string {
  return notImplemented("chartTintCss", slot, mode);
}

/** The tint color as a hex string, mixing `chartHex` into `cardHex` in oklab. */
export function mixTint(chartHex: string, cardHex: string, mode: "light" | "dark"): string {
  return notImplemented("mixTint", chartHex, cardHex, mode);
}
