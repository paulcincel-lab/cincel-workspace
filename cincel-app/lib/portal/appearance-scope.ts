/**
 * Organization theme scoped to the portal (redesign FE §3.11). Pure and client-safe.
 *
 * Portal clients have no `user_preferences` row and can't choose a theme, mode or style, so the portal
 * renders the org appearance on its own wrapper instead of on `<html>`: whatever a staff session in the same
 * browser has chosen never reaches the portal. The mode follows the OS (`system`, the default for a missing
 * preferences row).
 */
import type { OrgAppearance, StoredOrgAppearance } from "@/lib/types/redesign";
import { StoredOrgAppearanceSchema, withoutRetiredOrgAppearanceKeys } from "@/lib/validation/redesign";

/** `app_settings` key holding `{ version: 1, data: StoredOrgAppearance }` (BE §3.12). */
export const ORG_APPEARANCE_SETTING_KEY = "appearance.theme";

/** Attribute on the portal wrapper that the scoped token block targets. */
export const PORTAL_APPEARANCE_ATTRIBUTE = "data-portal-appearance";

/** `id` of the portal's `<style>` block (the staff block is `appearance`). */
export const PORTAL_APPEARANCE_STYLE_ID = "portal-appearance";

const VAR_NAME = /^--[a-z0-9-]+$/;
/** Characters that could close the declaration, the rule or the `<style>` element. */
const UNSAFE_VALUE = /[<>{};\\]/;

/** The stored org appearance, or null when the value is missing, not JSON or not a valid v1 envelope. */
export function parseStoredOrgAppearance(raw: string | null): StoredOrgAppearance | null {
  if (!raw) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as { version?: unknown; data?: unknown };
  if (envelope.version !== 1) return null;
  const parsed = StoredOrgAppearanceSchema.safeParse(withoutRetiredOrgAppearanceKeys(envelope.data));
  return parsed.success ? parsed.data : null;
}

/** `--name:value` declarations joined by `;`, skipping anything that isn't a plain custom property. */
function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .filter(([name, value]) => VAR_NAME.test(name) && typeof value === "string" && value.trim() !== "" && !UNSAFE_VALUE.test(value))
    .map(([name, value]) => `${name}:${value.trim()}`)
    .join(";");
}

/**
 * The portal token block: light values on the wrapper, dark values under `prefers-color-scheme: dark`.
 * Custom properties set on the wrapper win over anything inherited from `<html>`.
 */
export function portalAppearanceCss(cssVars: { light: Record<string, string>; dark: Record<string, string> }): string {
  const selector = `[${PORTAL_APPEARANCE_ATTRIBUTE}]`;
  const light = declarations(cssVars.light);
  const dark = declarations(cssVars.dark);
  return (
    `${selector}{color-scheme:light${light ? `;${light}` : ""}}` +
    `@media (prefers-color-scheme: dark){${selector}{color-scheme:dark${dark ? `;${dark}` : ""}}}`
  );
}

/** Org appearance with its version, as `resolveAppearance` takes it. */
export type PortalOrgAppearance = OrgAppearance & { v?: number };
