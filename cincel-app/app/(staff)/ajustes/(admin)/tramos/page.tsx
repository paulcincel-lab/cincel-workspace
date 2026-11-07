import { TramosClient } from "@/app/(staff)/configuracion/tramos/TramosClient";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Ajustes › Tramos y fases (redesign FE §3.8, §21.2): Project Flow's "Tramos y
 * fases" page rendered inside Ajustes, unchanged (same client, data and
 * actions). Administrador only (today's rule), checked by the segment layout
 * and here. New-only route: with the redesign off it redirects to the legacy
 * `/configuracion/tramos`.
 */
export default async function AjustesTramosPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await redirectIfRedesignOff("/ajustes/tramos", searchParams ? await searchParams : undefined);
  await requireSettingsAdminPage();

  let initialWorkflows: Awaited<ReturnType<typeof fetchWorkflowsAction>> = [];
  try {
    initialWorkflows = await fetchWorkflowsAction({
      includeInactive: true,
      includeInactiveTemplates: true,
      includeInactivePhases: true,
    });
  } catch {
    // The client falls back to hydrating itself, like the legacy page.
  }

  return <TramosClient initialWorkflows={initialWorkflows} />;
}
