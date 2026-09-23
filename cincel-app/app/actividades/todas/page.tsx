import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import { TodasActividadesClient } from "./TodasActividadesClient";

export default async function TodasActividadesPage() {
  let initialTasks: Awaited<ReturnType<typeof fetchTasksAction>> = [];
  try {
    initialTasks = await fetchTasksAction();
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <TodasActividadesClient initialTasks={initialTasks} />
      </section>
    </main>
  );
}
