import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

import KpiCard from "@/components/dashboard/KpiCard";
import TasksToday from "@/components/dashboard/TasksToday";
import AgendaToday from "@/components/dashboard/AgendaToday";
import ProjectsOverview from "@/components/dashboard/ProjectsOverview";
import DirectorSummary from "@/components/dashboard/DirectorSummary";

export default function Home() {
  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">

        <Header />

        {/* KPIs */}

        <div className="grid grid-cols-4 gap-6 mb-8">

          <KpiCard title="Proyectos" value="8" />

          <KpiCard title="Tareas" value="31" />

          <KpiCard title="Equipo" value="8" />

          <KpiCard title="Avance" value="72%" />

        </div>

        {/* Contenido */}

        <div className="grid grid-cols-3 gap-6">

          <div className="col-span-2 space-y-6">

            <TasksToday />

            <ProjectsOverview />

          </div>

          <div className="space-y-6">

            <AgendaToday />

            <DirectorSummary />

          </div>

        </div>

      </section>

    </main>
  );
}