import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchTaskStatusesAction } from "@/lib/actions/task-statuses-actions";
import { EstatusClient } from "./EstatusClient";

export default async function ConfiguracionEstatusPage() {
  let initialStatuses: Awaited<ReturnType<typeof fetchTaskStatusesAction>> = [];
  try {
    initialStatuses = await fetchTaskStatusesAction();
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <EstatusClient initialStatuses={initialStatuses} />
      </section>
    </main>
  );
}
