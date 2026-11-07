import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchPositionsAction } from "@/lib/actions/positions-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import type { Position, WorkflowDetail } from "@/lib/types/core";
import { PuestosClient } from "./PuestosClient";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function ConfiguracionPuestosPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/configuracion/puestos", searchParams);
  let initialPositions: Position[] = [];
  let initialWorkflows: WorkflowDetail[] = [];
  try {
    [initialPositions, initialWorkflows] = await Promise.all([fetchPositionsAction(), fetchWorkflowsAction()]);
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <PuestosClient initialPositions={initialPositions} initialWorkflows={initialWorkflows} />
      </section>
    </main>
  );
}
