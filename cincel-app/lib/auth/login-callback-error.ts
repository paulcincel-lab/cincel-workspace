/**
 * Errors the Google callback sends back to `/login?error=` (frontend spec §2.1).
 * Any other value is ignored, so a crafted link can't put arbitrary text on the page.
 */
export type LoginCallbackError = "state" | "retry";

export function parseLoginCallbackError(
  value: string | string[] | undefined,
): LoginCallbackError | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "state" || raw === "retry" ? raw : null;
}
