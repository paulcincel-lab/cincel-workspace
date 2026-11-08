import { TramosClient } from "./TramosClient";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Tramos y fases (redesign FE §3.8, §21.2): Project Flow's "Tramos y
 * fases" page rendered inside Ajustes, unchanged (same client, data and
 * actions). Administrador only (today's rule), checked by the segment layout
 * and here.
 */
export default async function AjustesTramosPage() {
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
