import { Suspense } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import PresaleTable from "@/components/tareas/PresaleTable";
import { fetchActivitiesAction } from "@/lib/actions/activities-actions";

export default async function PresalePage() {
  let serverTasks: Awaited<ReturnType<typeof fetchActivitiesAction>> | undefined;
  try {
    serverTasks = await fetchActivitiesAction("Presale");
  } catch {
    // Not authorized / no session — the client hydrates itself.
  }

  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">

        <Header />

        <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-800">Cargando actividades...</div>}>
          <PresaleTable serverTasks={serverTasks} />
        </Suspense>

      </section>

    </main>
  );
}
