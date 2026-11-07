import "server-only";

import type { ResolvedAppearance } from "@/lib/types/redesign";
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";
import { resolveAppearance } from "@/lib/ui/preferences";

/**
 * The caller's resolved appearance (redesign BE §8.1): reads
 * `appearance.theme` (per-request cache) and the caller's preferences row; on
 * DB errors logs and returns the Azul defaults, like `getPrimaryColor`.
 *
 * Contract stub: resolves the Azul preset with no user row (flag off).
 */
export async function getResolvedAppearance(): Promise<ResolvedAppearance> {
  return resolveAppearance(DEFAULT_ORG_APPEARANCE, null);
}
