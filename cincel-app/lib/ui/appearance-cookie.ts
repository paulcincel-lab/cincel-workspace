/**
 * Reading the appearance cookie back (BE §8.2). Kept apart from
 * `lib/ui/preferences.ts` because it validates with zod: that module is in
 * every page's client bundle (StyleProvider), this one is only read on the
 * server.
 */
import type { AppearanceCookie } from "@/lib/types/redesign";
import { AppearanceCookieSchema } from "@/lib/validation/redesign";

/**
 * Parses the cookie and re-validates every value. Returns null when it is
 * missing, malformed, or its `v` differs from the current org version (the
 * server then recomputes from the DB, BE §8.2).
 */
export function parseAppearanceCookie(raw: string | null | undefined, currentVersion: number): AppearanceCookie | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    try {
      json = JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
  const parsed = AppearanceCookieSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.v === currentVersion ? parsed.data : null;
}
