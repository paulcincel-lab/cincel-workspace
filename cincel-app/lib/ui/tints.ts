/**
 * Tint utilities (redesign FE §14.5, BE §5.3, §5.5): `chart-N-tint` =
 * `color-mix(in oklab, var(--chart-N) 14%, var(--card))` in light mode and
 * 22 % in dark mode. Text on a tint uses `chart-N-ink`. The same formula is
 * evaluated by `lib/ui/contrast.ts`, so the checker measures the real tint.
 *
 * Also holds the small color toolkit both modules share: parsing of the
 * accepted token syntax (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgba(r,g,b,a)`,
 * BE §5.4), alpha compositing and sRGB ↔ oklab conversion. Pure and
 * client-importable.
 */

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

/** sRGB color: channels 0–255 (may be fractional), alpha 0–1. */
export type Rgba = { r: number; g: number; b: number; a: number };

type Oklab = { L: number; a: number; b: number };

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NUM = "(\\d{1,3}(?:\\.\\d+)?)";
const RGBA_RE = new RegExp(`^rgba?\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*(?:,\\s*(\\d*\\.?\\d+)\\s*)?\\)$`, "i");

/**
 * Parses a token value in the accepted syntax (BE §5.4). Returns `null` for
 * anything else (the schema maps that to `INVALID`).
 */
export function parseColor(input: string): Rgba | null {
  const value = input.trim();
  const hex = HEX_RE.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) digits = digits.split("").map((d) => d + d).join("");
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgba = RGBA_RE.exec(value);
  if (rgba) {
    const [r, g, b] = [rgba[1], rgba[2], rgba[3]].map(Number);
    const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if ([r, g, b].some((c) => c > 255) || !(a >= 0 && a <= 1)) return null;
    return { r, g, b, a };
  }
  return null;
}

/** Like `parseColor`, but throws `INVALID: <value>` on unreadable input. */
export function requireColor(input: string): Rgba {
  const color = parseColor(input);
  if (!color) throw new Error(`INVALID: ${input}`);
  return color;
}

/** Source-over compositing of `fg` on `bg` (straight alpha). */
export function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const channel = (f: number, b: number) => (f * fg.a + b * bg.a * (1 - fg.a)) / a;
  return { r: channel(fg.r, bg.r), g: channel(fg.g, bg.g), b: channel(fg.b, bg.b), a };
}

function clamp255(value: number): number {
  return Math.min(255, Math.max(0, value));
}

/** `#rrggbb`, or `#rrggbbaa` when the color is translucent. */
export function toHex(color: Rgba): string {
  const byte = (v: number) => Math.round(clamp255(v)).toString(16).padStart(2, "0");
  const alpha = Math.round(Math.min(1, Math.max(0, color.a)) * 255);
  return `#${byte(color.r)}${byte(color.g)}${byte(color.b)}${alpha === 255 ? "" : alpha.toString(16).padStart(2, "0")}`;
}

/** sRGB channel (0–255) → linear light (0–1). */
export function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light (0–1) → sRGB channel (0–255, unclamped). */
export function linearToSrgb(value: number): number {
  const v = Math.abs(value) <= 0.0031308 ? value * 12.92 : Math.sign(value) * (1.055 * Math.abs(value) ** (1 / 2.4) - 0.055);
  return v * 255;
}

function toOklab(color: Rgba): Oklab {
  const r = srgbToLinear(color.r);
  const g = srgbToLinear(color.g);
  const b = srgbToLinear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function fromOklab(lab: Oklab, alpha: number): Rgba {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r: clamp255(linearToSrgb(r)), g: clamp255(linearToSrgb(g)), b: clamp255(linearToSrgb(b)), a: alpha };
}

/**
 * CSS `color-mix(in oklab, <a> <percentA>%, <b>)`: interpolation in oklab
 * with premultiplied alpha, as CSS Color 5 defines it.
 */
export function mixOklab(a: Rgba, b: Rgba, percentA: number): Rgba {
  const p = Math.min(100, Math.max(0, percentA)) / 100;
  const labA = toOklab(a);
  const labB = toOklab(b);
  const alpha = a.a * p + b.a * (1 - p);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (x: number, y: number) => (x * a.a * p + y * b.a * (1 - p)) / alpha;
  return fromOklab({ L: mix(labA.L, labB.L), a: mix(labA.a, labB.a), b: mix(labA.b, labB.b) }, alpha);
}

/** CSS `color-mix(...)` for the tint of a chart slot in one mode. */
export function chartTintCss(slot: ChartSlot, mode: "light" | "dark"): string {
  return `color-mix(in oklab, var(--chart-${slot}) ${TINT_PERCENT[mode]}%, var(--card))`;
}

/** The tint as an unrounded color, mixing `chart` into `card` in oklab. */
export function mixTintColor(chart: string, card: string, mode: "light" | "dark"): Rgba {
  return mixOklab(requireColor(chart), requireColor(card), TINT_PERCENT[mode]);
}

/** The tint color as a hex string, mixing `chartHex` into `cardHex` in oklab. */
export function mixTint(chartHex: string, cardHex: string, mode: "light" | "dark"): string {
  return toHex(mixTintColor(chartHex, cardHex, mode));
}
