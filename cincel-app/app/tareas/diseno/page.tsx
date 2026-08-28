import { Suspense } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import PresaleTable from "@/components/tareas/PresaleTable";
import { disenoTasks } from "@/lib/data/diseno";
import { disenoTemplate } from "@/lib/templates/diseno";
import { disenoPhaseOptions } from "@/lib/templates/phase-options";
import { fetchActivitiesAction } from "@/lib/actions/activities-actions";

export default async function DisenoPage() {
  let serverTasks: Awaited<ReturnType<typeof fetchActivitiesAction>> | undefined;
  try {
    serverTasks = await fetchActivitiesAction("Diseño");
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
            title="Taller de Diseño"
            subtitle="Flujo de anteproyecto, proyecto y ejecutivo"
            workflow="Diseño"
            initialTasks={disenoTasks}
            serverTasks={serverTasks}
            templateItems={disenoTemplate}
            templateName="Taller de Diseño"
            phaseOptions={disenoPhaseOptions}
          />
        </Suspense>
      </section>
    </main>
  );
}
