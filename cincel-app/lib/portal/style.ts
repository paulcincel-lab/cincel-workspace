/**
 * Presentation style of the client portal (FE §3.11, §15.1). Portal users have
 * no `user_preferences` row, so their choice lives in the `cincel-portal-style`
 * cookie: written by `EstiloSwitch scope="portal"`, read by the portal layout.
 * Pure and client-safe; `lib/portal/appearance.ts` is the server side.
 */
import type { OrgAppearance, PresentationStyle } from "@/lib/types/redesign";
import { PORTAL_STYLE_COOKIE } from "@/lib/ui/preferences";

export { PORTAL_STYLE_COOKIE };

export const PORTAL_STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

/** The cookie lives one year; the portal session itself is shorter. */
export const PORTAL_STYLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A known style, or null for anything else (case and accents tolerated: "Analítico" → "analitico"). */
export function parsePortalStyle(value: unknown): PresentationStyle | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return (PORTAL_STYLES as readonly string[]).includes(normalized) ? (normalized as PresentationStyle) : null;
}

/** The `document.cookie` string that stores `style` for every `/portal` page. */
export function serializePortalStyleCookie(style: PresentationStyle): string {
  return `${PORTAL_STYLE_COOKIE}=${style}; path=/; max-age=${PORTAL_STYLE_COOKIE_MAX_AGE}; samesite=lax`;
}

/** The value of `cincel-portal-style` in a `Cookie` header / `document.cookie` string, or undefined. */
export function readPortalStyleCookie(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === PORTAL_STYLE_COOKIE) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

/**
 * The style the portal renders: the cookie when it holds a known style and the
 * organization allows a personal style, else the organization default. An
 * invalid or missing cookie falls back to the default.
 */
export function resolvePortalStyle(
  cookieValue: string | null | undefined,
  org: Pick<OrgAppearance, "styleDefault" | "allowUserOverride">,
): PresentationStyle {
  const chosen = org.allowUserOverride ? parsePortalStyle(cookieValue) : null;
  return chosen ?? org.styleDefault;
}
