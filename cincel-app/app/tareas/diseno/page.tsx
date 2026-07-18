import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import PresaleTable from "@/components/tareas/PresaleTable";
import { disenoTasks } from "@/lib/data/diseno";
import { disenoTemplate } from "@/lib/templates/diseno";
import { disenoPhaseOptions } from "@/lib/templates/phase-options";

export default function DisenoPage() {
  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <PresaleTable
          title="Taller de Diseño"
          subtitle="Flujo de anteproyecto, proyecto y ejecutivo"
          workflow="Diseño"
          initialTasks={disenoTasks}
          templateItems={disenoTemplate}
          templateName="Taller de Diseño"
          phaseOptions={disenoPhaseOptions}
        />
      </section>
    </main>
  );
}
