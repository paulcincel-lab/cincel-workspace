/**
 * Color math shared by `tints.ts` and `contrast.ts` (redesign BE §5.5, §8.2):
 * parsing `#rgb` / `#rrggbb` / `rgb()` / `rgba()`, compositing over an opaque
 * background, oklab mixing (the same as CSS `color-mix(in oklab, …)`) and the
 * WCAG 2.1 contrast ratio. Pure and client-importable.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

/** Parse a hex or `rgb()` / `rgba()` color; channels 0–255, alpha 0–1. */
export function parseColor(value: string): Rgba {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) throw new Error(`INVALID: color ${value}`);
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(v);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) throw new Error(`INVALID: color ${value}`);
    const channel = (p: string) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const out = { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: alpha };
    if ([out.r, out.g, out.b, out.a].some((x) => Number.isNaN(x))) throw new Error(`INVALID: color ${value}`);
    return out;
  }
  throw new Error(`INVALID: color ${value}`);
}

/** `fg` composited over an opaque `bg` (alpha blending in sRGB, as browsers paint). */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (l: number) => {
  const s = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, s * 255));
};

/** WCAG 2.1 relative luminance of an opaque color. */
export function relativeLuminance(c: Rgba): number {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** WCAG 2.1 contrast ratio of two opaque colors (1–21). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toOklab(c: Rgba): [number, number, number] {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, A, B]: [number, number, number]): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: 1,
  };
}

/** Opaque color as `#rrggbb`. */
export function toHex(c: Rgba): string {
  const h = (x: number) => Math.round(x).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** `color-mix(in oklab, <a> <weight*100>%, <b>)` of two opaque colors, as an opaque color. */
export function mixOklabRgba(a: Rgba, b: Rgba, weight: number): Rgba {
  const la = toOklab(a);
  const lb = toOklab(b);
  return fromOklab([0, 1, 2].map((i) => la[i] * weight + lb[i] * (1 - weight)) as [number, number, number]);
}

/** `color-mix(in oklab, <a> <weight*100>%, <b>)` as `#rrggbb`. */
export function mixOklab(a: string, b: string, weight: number): string {
  return toHex(mixOklabRgba(parseColor(a), parseColor(b), weight));
}
