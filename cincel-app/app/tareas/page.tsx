import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";

function getProjects(projects: string[]) {
  return Array.from(new Set(projects)).sort((a, b) => a.localeCompare(b));
}

const stageCards = [
  {
    title: "Presale",
    href: "/tareas/presale",
    projects: getProjects(presaleTasks.map((task) => task.project)),
    toneClassName: "border-blue-100 bg-blue-50/40",
  },
  {
    title: "Taller de Diseño",
    href: "/tareas/diseno",
    projects: getProjects(disenoTasks.map((task) => task.project)),
    toneClassName: "border-emerald-100 bg-emerald-50/40",
  },
  {
    title: "Construcción",
    href: "/tareas/construccion",
    projects: getProjects(operativasTasks.map((task) => task.project)),
    toneClassName: "border-amber-100 bg-amber-50/40",
  },
];

export default function TareasPage() {
  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">

        <Header />

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">

          <h1 className="text-3xl font-bold">
            Actividades
          </h1>

          <p className="text-slate-500 mt-2">
            Selecciona una etapa y revisa los proyectos activos.
          </p>

          <div className="mt-10 space-y-5">
            {stageCards.map((stage) => (
              <div key={stage.title} className={`rounded-2xl border p-6 ${stage.toneClassName}`}>
                <Link href={stage.href} className="inline-flex items-center text-2xl font-bold text-slate-900 hover:text-blue-700">
                  {stage.title}
                </Link>

                <div className="mt-4 flex flex-wrap gap-2">
                  {stage.projects.length === 0 ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-500">
                      Sin proyectos
                    </span>
                  ) : (
                    stage.projects.map((project) => (
                      <Link
                        key={`${stage.title}-${project}`}
                        href={{
                          pathname: stage.href,
                          query: { project },
                        }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {project}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>

      </section>

    </main>
  );
}