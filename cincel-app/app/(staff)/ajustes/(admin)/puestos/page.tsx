import { PuestosClient } from "@/app/configuracion/puestos/PuestosClient";
import { fetchPositionsAction } from "@/lib/actions/positions-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import type { Position, WorkflowDetail } from "@/lib/types/core";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Ajustes › Puestos (redesign FE §3.8, §21.2): Project Flow's "Puestos" page
 * rendered inside Ajustes, unchanged (same client, data and actions).
 * Administrador only (today's rule), checked by the segment layout and here.
 * New-only route: with the redesign off it redirects to the legacy
 * `/configuracion/puestos`.
 */
export default async function AjustesPuestosPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await redirectIfRedesignOff("/ajustes/puestos", searchParams ? await searchParams : undefined);
  await requireSettingsAdminPage();

  let initialPositions: Position[] = [];
  let initialWorkflows: WorkflowDetail[] = [];
  try {
    [initialPositions, initialWorkflows] = await Promise.all([fetchPositionsAction(), fetchWorkflowsAction()]);
  } catch {
    // The client falls back to hydrating itself, like the legacy page.
  }

  return <PuestosClient initialPositions={initialPositions} initialWorkflows={initialWorkflows} />;
}
