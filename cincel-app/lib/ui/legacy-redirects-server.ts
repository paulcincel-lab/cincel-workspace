import "server-only";

import { notFound, redirect } from "next/navigation";

import { legacyRedirectTarget, type LegacySearchParams } from "@/lib/ui/legacy-redirects";

/**
 * Redirect for an old route (FE §2.2). An old `page.tsx` returns it: it
 * redirects to the FE §2.2 target with the query string preserved, or renders
 * the 404 when `pathname` is not in the table.
 */
export async function redirectLegacy(
  pathname: string,
  searchParams?: LegacySearchParams | Promise<LegacySearchParams>,
): Promise<never> {
  const target = legacyRedirectTarget(pathname, await searchParams);
  if (!target) notFound();
  redirect(target);
}
