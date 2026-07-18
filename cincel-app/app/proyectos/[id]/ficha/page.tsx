import Link from "next/link";
import { notFound } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";

import { projects } from "@/lib/data/projects";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";

type Props = {
  params: {
    id: string;
  };
};

export default function ProjectFichaPage({ params }: Props) {
  const project = projects.find((item) => item.id === Number(params.id));

  if (!project) {
    notFound();
  }

  const projectActivities = [
    { label: "Presale", tasks: presaleTasks },
    { label: "Diseño", tasks: disenoTasks },
    { label: "Construcción", tasks: operativasTasks },
  ].filter((activity) => activity.tasks.some((task) => task.project === project.name));

  const internalDocsUrl = project.drive.administrativo;
  const clientDocsUrl = project.drive.reportes;

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{project.code}</p>
                <h1 className="mt-1 text-3xl font-bold text-slate-900">Ficha del proyecto</h1>
                <p className="mt-1 text-slate-600">{project.name}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/proyectos/${project.id}`}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Abrir proyecto
                </Link>
                <Link
                  href={`/tareas?project=${encodeURIComponent(project.name)}`}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Ver tareas
                </Link>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-1">
                <p className="text-xs text-slate-500">Actividades donde participa</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {projectActivities.length === 0 ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                      Sin actividades
                    </span>
                  ) : (
                    projectActivities.map((activity) => (
                      <span key={`${project.id}-${activity.label}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {activity.label}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <p className="text-xs text-slate-500">Documentos en Google Drive</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {internalDocsUrl ? (
                    <a
                      href={internalDocsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Documentos internos
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-400"
                    >
                      Documentos internos
                    </button>
                  )}

                  {clientDocsUrl ? (
                    <a
                      href={clientDocsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Documentos vista cliente
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-400"
                    >
                      Documentos vista cliente
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900">Datos generales</h2>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="mt-1 font-medium text-slate-800">{project.client.name}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Tipo</p>
                  <p className="mt-1 font-medium text-slate-800">{project.type}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Etapa</p>
                  <p className="mt-1 font-medium text-slate-800">{project.stage}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Fase</p>
                  <p className="mt-1 font-medium text-slate-800">{project.phase}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                  <p className="text-xs text-slate-500">Dirección</p>
                  <p className="mt-1 font-medium text-slate-800">
                    {project.address.street ? `${project.address.street}, ` : ""}
                    {project.address.city}, {project.address.state}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Roles clave</h2>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Responsable</p>
                  <div className="mt-2">
                    <Avatar name={project.manager} />
                  </div>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <p className="text-xs text-slate-500">Encargado cliente</p>
                  <div className="mt-2">
                    <Avatar name={project.coordinator || "Sin encargado"} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
