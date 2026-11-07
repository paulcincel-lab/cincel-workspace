/**
 * Redesign opt-in from the legacy UI (redesign FE §2.3, §18 item 17): who sees
 * the legacy dashboard banner and the legacy menu entry, and the copy they
 * show. Pure and client-safe.
 */
import { actionErrorCode, actionErrorText } from "@/lib/errors";

/**
 * - `hidden`: nothing renders (the user already has the new design, or the
 *   opt-in write is not implemented yet, FE §9 stubs rule).
 * - `available`: the entry point is active.
 * - `unavailable`: the org kill switch (`redesignAvailable`) is off.
 */
export type RedesignOptInVisibility = "hidden" | "available" | "unavailable";

export type RedesignOptInInput = {
  /** `IMPLEMENTED.updateMyPreferencesAction`. */
  implemented: boolean;
  /** The caller's resolved flag (`ResolvedAppearance.redesignEnabled`). */
  redesignEnabled: boolean;
  /** `OrgAppearance.redesignAvailable`. */
  redesignAvailable: boolean;
};

export function redesignOptInVisibility({
  implemented,
  redesignEnabled,
  redesignAvailable,
}: RedesignOptInInput): RedesignOptInVisibility {
  if (!implemented || redesignEnabled) return "hidden";
  return redesignAvailable ? "available" : "unavailable";
}

/** FE §9: `DISABLED` (redesign opt-in). */
export const REDESIGN_OPT_IN_DISABLED_COPY = "El nuevo diseño no está disponible por ahora.";

/** Spanish copy for an opt-in failure: the redesign `DISABLED` copy, else the shared mapper. */
export function redesignOptInErrorText(err: unknown): string {
  return actionErrorCode(err) === "DISABLED" ? REDESIGN_OPT_IN_DISABLED_COPY : actionErrorText(err);
}

/** Client-storage key that remembers a dismissed dashboard banner, per user. */
export function redesignBannerDismissKey(userId: string): string {
  return `cincel-redesign-banner-dismissed:${userId}`;
}
