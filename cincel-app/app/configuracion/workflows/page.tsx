import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { WorkflowsClient } from "./WorkflowsClient";

export default async function ConfiguracionWorkflowsPage() {
  let initialWorkflows: Awaited<ReturnType<typeof fetchWorkflowsAction>> = [];
  try {
    initialWorkflows = await fetchWorkflowsAction({ includeInactive: true, includeInactiveTemplates: true });
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <WorkflowsClient initialWorkflows={initialWorkflows} />
      </section>
    </main>
  );
}
