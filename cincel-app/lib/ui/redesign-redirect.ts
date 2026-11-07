import "server-only";

import { redirect } from "next/navigation";

import { getResolvedAppearance } from "@/lib/ui/preferences-server";
import { redesignRedirectTarget, type RedesignSearchParams } from "@/lib/ui/redesign-redirect-target";

/**
 * Flag-aware redirect for the redesign's new-only routes (FE §2.3). A new-only
 * page (`/inicio`, `/mi-espacio`, `/tareas`, `/personas*`, `/biblioteca*`,
 * `/ajustes/*`) awaits it before anything else: when the caller's resolved
 * appearance has `redesignEnabled` off (read server-side from the
 * `cincel-appearance` cookie, re-validated from the DB, and forced off by the
 * org kill switch `redesignAvailable`) it redirects to the legacy equivalent
 * (e.g. `/inicio` → `/dashboard`); with it on it returns and the page renders.
 * If the appearance cannot be resolved the flag counts as off, like the root
 * layout. Routes that exist in both worlds (`/proyectos/*`, `/asistente`)
 * never redirect.
 */
export async function redirectIfRedesignOff(
  pathname: string,
  searchParams?: RedesignSearchParams | Promise<RedesignSearchParams>,
): Promise<void> {
  const target = redesignRedirectTarget(pathname, await searchParams);
  if (!target) return;

  let enabled = false;
  try {
    enabled = (await getResolvedAppearance()).redesignEnabled;
  } catch {
    enabled = false;
  }
  if (enabled) return;

  redirect(target);
}
