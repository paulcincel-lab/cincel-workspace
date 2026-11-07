import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchMyTasksAction } from "@/lib/actions/tasks-actions";
import { MisTareasClient } from "./MisTareasClient";

export default async function MisTareasPage() {
  let initialTasks: Awaited<ReturnType<typeof fetchMyTasksAction>> = [];
  try {
    initialTasks = await fetchMyTasksAction();
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <MisTareasClient initialTasks={initialTasks} />
      </section>
    </main>
  );
}
