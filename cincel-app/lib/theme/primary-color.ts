import colors from "tailwindcss/colors";

/**
 * Company-wide primary color, picked from the Tailwind palette and stored as
 * a `<family>-<shade>` token (e.g. "red-600"). No token = the default
 * black/white tokens in app/globals.css.
 */

export const PRIMARY_COLOR_SHADES = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const;

/**
 * Families offered in the picker. The Cincel brand is monochrome; to keep the
 * choice within it, trim this list to the neutral families (slate, gray, zinc,
 * neutral, stone, mauve, olive, mist, taupe).
 */
export const PRIMARY_COLOR_FAMILIES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "mauve",
  "olive",
  "mist",
  "taupe",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

export type PrimaryColorFamily = (typeof PRIMARY_COLOR_FAMILIES)[number];
export type PrimaryColorShade = (typeof PRIMARY_COLOR_SHADES)[number];
export type PrimaryColorToken = `${PrimaryColorFamily}-${PrimaryColorShade}`;

export const PRIMARY_COLOR_SETTING_KEY = "appearance.primary_color";

export function isPrimaryColorToken(value: unknown): value is PrimaryColorToken {
  if (typeof value !== "string") return false;
  const cut = value.lastIndexOf("-");
  const family = value.slice(0, cut);
  const shade = value.slice(cut + 1);
  return (
    (PRIMARY_COLOR_FAMILIES as readonly string[]).includes(family) &&
    (PRIMARY_COLOR_SHADES as readonly string[]).includes(shade)
  );
}

function splitToken(token: PrimaryColorToken): [PrimaryColorFamily, PrimaryColorShade] {
  const cut = token.lastIndexOf("-");
  return [token.slice(0, cut) as PrimaryColorFamily, token.slice(cut + 1) as PrimaryColorShade];
}

/** The CSS color (Tailwind's oklch value) for a token. */
export function primaryColorValue(token: PrimaryColorToken): string {
  const [family, shade] = splitToken(token);
  return colors[family][shade];
}

/**
 * Text color that reads on top of an oklch color: whichever of white or the
 * near-black foreground gives the higher WCAG contrast. Relative luminance is
 * approximated from oklch lightness as L³ (exact for grays, close for hues).
 */
export function readableForeground(oklch: string): "#ffffff" | "#0a0a0a" {
  const match = /oklch\(\s*([\d.]+)%/.exec(oklch);
  const lightness = match ? Number(match[1]) / 100 : 0;
  const luminance = lightness ** 3;
  const onWhite = 1.05 / (luminance + 0.05);
  const onBlack = (luminance + 0.05) / (0.003 + 0.05);
  return onWhite >= onBlack ? "#ffffff" : "#0a0a0a";
}

/** Dark mode flips the scale (600 → 400), like the default tokens flip black to off-white. */
export function darkModeToken(token: PrimaryColorToken): PrimaryColorToken {
  const [family, shade] = splitToken(token);
  const index = PRIMARY_COLOR_SHADES.indexOf(shade);
  return `${family}-${PRIMARY_COLOR_SHADES[PRIMARY_COLOR_SHADES.length - 1 - index]}`;
}

function declarations(token: PrimaryColorToken): string {
  const color = primaryColorValue(token);
  const foreground = readableForeground(color);
  return [
    `--primary:${color}`,
    `--primary-foreground:${foreground}`,
    `--ring:${color}`,
    `--sidebar-primary:${color}`,
    `--sidebar-primary-foreground:${foreground}`,
    `--sidebar-ring:${color}`,
  ].join(";");
}

/**
 * CSS overriding the primary tokens of app/globals.css. The `html:root`
 * selectors are one step more specific than the ones in globals.css, so the
 * override wins regardless of stylesheet order; light and dark (explicit
 * toggle or OS preference) are both covered. Empty for no token.
 */
export function primaryColorCss(token: PrimaryColorToken | null): string {
  if (!token) return "";
  const light = declarations(token);
  const dark = declarations(darkModeToken(token));
  return (
    `html:root{${light}}` +
    `html.dark,html:root[data-theme="dark"]{${dark}}` +
    `@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){${dark}}}`
  );
}
