import "server-only";

import { redirect } from "next/navigation";

import { legacyRedirectTarget, type LegacySearchParams } from "@/lib/ui/legacy-redirects";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

/**
 * Flag-aware redirect for a legacy route (FE §2.2, §2.3). A legacy `page.tsx`
 * awaits it before anything else: when the caller's resolved appearance has
 * `redesignEnabled` (read server-side from the `cincel-appearance` cookie,
 * re-validated from the DB) it redirects to the FE §2.2 target with the query
 * string preserved; otherwise it returns and the page renders as today. If the
 * appearance cannot be resolved the flag counts as off, so a legacy bookmark
 * never breaks.
 */
export async function redirectLegacyIfRedesignOn(
  pathname: string,
  searchParams?: LegacySearchParams | Promise<LegacySearchParams>,
): Promise<void> {
  let enabled = false;
  try {
    enabled = (await getResolvedAppearance()).redesignEnabled;
  } catch {
    enabled = false;
  }
  if (!enabled) return;

  const target = legacyRedirectTarget(pathname, await searchParams);
  if (target) redirect(target);
}
