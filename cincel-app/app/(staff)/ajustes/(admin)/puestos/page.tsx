import { PuestosClient } from "./PuestosClient";
import { fetchPositionsAction } from "@/lib/actions/positions-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import type { Position, WorkflowDetail } from "@/lib/types/core";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Puestos (redesign FE §3.8, §21.2): Project Flow's "Puestos" page
 * rendered inside Ajustes, unchanged (same client, data and actions).
 * Administrador only (today's rule), checked by the segment layout and here.
 */
export default async function AjustesPuestosPage() {
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
