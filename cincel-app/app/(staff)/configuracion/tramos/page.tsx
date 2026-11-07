import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { TramosClient } from "./TramosClient";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function ConfiguracionTramosPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/configuracion/tramos", searchParams);
  let initialWorkflows: Awaited<ReturnType<typeof fetchWorkflowsAction>> = [];
  try {
    initialWorkflows = await fetchWorkflowsAction({
      includeInactive: true,
      includeInactiveTemplates: true,
      includeInactivePhases: true,
    });
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <TramosClient initialWorkflows={initialWorkflows} />
      </section>
    </main>
  );
}
