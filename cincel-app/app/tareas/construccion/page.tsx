import { Suspense } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

import PresaleTable from "@/components/tareas/PresaleTable";
import { operativasTasks } from "@/lib/data/operativas";
import { operativasTemplate } from "@/lib/templates/operativas";
import { construccionPhaseOptions } from "@/lib/templates/phase-options";
import { fetchActivitiesAction } from "@/lib/actions/activities-actions";

export default async function ConstruccionPage() {
  let serverTasks: Awaited<ReturnType<typeof fetchActivitiesAction>> | undefined;
  try {
    serverTasks = await fetchActivitiesAction("Construcción");
  } catch {
    // Not authorized / no session — the client hydrates itself.
  }

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-800">Cargando actividades...</div>}>
          <PresaleTable
            title="Construcción"
            subtitle="Flujo operativo de ejecución"
            workflow="Construcción"
            initialTasks={operativasTasks}
            serverTasks={serverTasks}
            templateItems={operativasTemplate}
            templateName="Construcción"
            phaseOptions={construccionPhaseOptions}
          />
        </Suspense>
      </section>
    </main>
  );
}
