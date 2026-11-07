/**
 * Presentation style resolution helpers (redesign FE §4.2, §15.1). Pure and
 * client-safe; pages and layouts call them on the server so server and
 * client render the same style.
 *
 * `style = urlOverride ?? (org.allowUserOverride ? user.style : null) ?? org.styleDefault`
 */
import type { PresentationStyle } from "@/lib/types/redesign";

export const PRESENTATION_STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

/** Name of the URL parameter that overrides the style for one render. */
export const ESTILO_PARAM = "estilo";

/** Portal style cookie lifetime: one year. */
export const PORTAL_STYLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A known style, or null for anything else (case and accents tolerated: "Analítico" → "analitico"). */
export function parsePresentationStyle(value: unknown): PresentationStyle | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return (PRESENTATION_STYLES as readonly string[]).includes(normalized) ? (normalized as PresentationStyle) : null;
}

type SearchParamsLike =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

/** The `?estilo=` override of a page's `searchParams` (first value wins), or null. */
export function readEstiloOverride(searchParams: SearchParamsLike): PresentationStyle | null {
  if (!searchParams) return null;
  if (searchParams instanceof URLSearchParams) return parsePresentationStyle(searchParams.get(ESTILO_PARAM));
  const raw = searchParams[ESTILO_PARAM];
  return parsePresentationStyle(Array.isArray(raw) ? raw[0] : raw);
}

export type PageStyle = {
  style: PresentationStyle;
  /** True when `style` came from the `?estilo=` override. */
  isOverridden: boolean;
  /** True when the organization fixed the style (no user override), so the switch is disabled. */
  fixedByOrg: boolean;
};

/**
 * The style a page renders (FE §15.1). `chosen` is the user's preference
 * (staff) or the `cincel-portal-style` cookie (portal); it only counts when
 * the organization allows overrides.
 */
export function resolvePageStyle(input: {
  override: PresentationStyle | null;
  chosen: PresentationStyle | null;
  styleDefault: PresentationStyle;
  allowUserOverride: boolean;
}): PageStyle {
  const fixedByOrg = !input.allowUserOverride;
  if (input.override) return { style: input.override, isOverridden: true, fixedByOrg };
  const chosen = input.allowUserOverride ? input.chosen : null;
  return { style: chosen ?? input.styleDefault, isOverridden: false, fixedByOrg };
}

/** The `Set-Cookie`-style string `EstiloSwitch scope="portal"` writes to `document.cookie`. */
export function portalStyleCookie(name: string, style: PresentationStyle): string {
  return `${name}=${style}; path=/; max-age=${PORTAL_STYLE_COOKIE_MAX_AGE}; samesite=lax`;
}

/** Browser-only: stores the portal style choice in its cookie (`EstiloSwitch scope="portal"`). */
export function writePortalStyleCookie(name: string, style: PresentationStyle): void {
  document.cookie = portalStyleCookie(name, style);
}
