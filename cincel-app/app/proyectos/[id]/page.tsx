import { notFound } from "next/navigation";
import Link from "next/link";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import AppAvatar from "@/components/ui/AppAvatar";

import { projects } from "@/lib/data/projects";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { departamentoSlugForStage } from "@/lib/actividades/departamento";

type Props = {
  params: {
    id: string;
  };
};

export default function ProjectDetailPage({ params }: Props) {
  const project = projects.find(
    (p) => p.id === Number(params.id)
  );

  if (!project) {
    notFound();
  }

  const projectActivities = [
    { label: "Presale", tasks: presaleTasks },
    { label: "Diseño", tasks: disenoTasks },
    { label: "Construcción", tasks: operativasTasks },
  ].map((activity) => {
    const tasks = activity.tasks.filter((task) => task.project === project.name && !task.archived);

    return {
      ...activity,
      tasks,
      pending: tasks.filter((task) => task.status === "Pendiente").length,
      inProgress: tasks.filter((task) => task.status === "En proceso").length,
      blocked: tasks.filter((task) => task.status === "Bloqueado").length,
      completed: tasks.filter((task) => task.status === "Completado").length,
    };
  });

  const totalTasks = projectActivities.reduce((acc, activity) => acc + activity.tasks.length, 0);
  const blockedTasks = projectActivities.reduce((acc, activity) => acc + activity.blocked, 0);
  const inProgressTasks = projectActivities.reduce((acc, activity) => acc + activity.inProgress, 0);

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">
        <Header />

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{project.code}</p>
              <h1 className="mt-1 text-3xl font-bold text-foreground">{project.name}</h1>
              <p className="mt-1 text-muted-foreground">{project.client.name} · {project.type} · {project.stage}</p>
            </div>

            <span className={`rounded-full px-4 py-2 text-sm font-medium ${project.status === "Activo" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>
              {project.status}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Avance</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{project.progress}%</p>
            </div>
            <div className="rounded-xl border border-border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Total actividades</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{totalTasks}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted p-3">
              <p className="text-xs text-muted-foreground">En proceso</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{inProgressTasks}</p>
            </div>
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3">
              <p className="text-xs text-muted-foreground">Bloqueadas</p>
              <p className="mt-1 text-xl font-semibold text-destructive">{blockedTasks}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/actividades/${departamentoSlugForStage(project.stage)}?project=${encodeURIComponent(project.name)}`} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80">
              Ver actividades
            </Link>
            <a
              href={project.drive.administrativo || "#"}
              target="_blank"
              rel="noreferrer"
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${project.drive.administrativo ? "border-border bg-card text-foreground hover:bg-muted" : "cursor-not-allowed border-border bg-muted text-muted-foreground"}`}
            >
              Drive interno
            </a>
            <a
              href={project.drive.reportes || "#"}
              target="_blank"
              rel="noreferrer"
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${project.drive.reportes ? "border-border bg-card text-foreground hover:bg-muted" : "cursor-not-allowed border-border bg-muted text-muted-foreground"}`}
            >
              Drive cliente
            </a>
            <Link href={`/proyectos/${project.id}/ficha`} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
              Abrir ficha completa
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Estado por etapa</h2>

              <div className="mt-4 space-y-3">
                {projectActivities.map((activity) => (
                  <div key={`${project.id}-${activity.label}`} className="rounded-xl border border-border bg-muted p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{activity.label}</p>
                      <span className="text-xs text-muted-foreground">{activity.tasks.length} actividad(es)</span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">Pendiente: <span className="font-semibold">{activity.pending}</span></div>
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">En proceso: <span className="font-semibold">{activity.inProgress}</span></div>
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">Completado: <span className="font-semibold">{activity.completed}</span></div>
                      <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">Bloqueado: <span className="font-semibold">{activity.blocked}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Roles clave</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Responsable</p>
                  <div className="mt-2">
                    <AppAvatar name={project.manager} />
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Encargado cliente</p>
                  <div className="mt-2">
                    <AppAvatar name={project.coordinator || "Sin encargado"} />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Contexto del proyecto</h2>
              <div className="mt-3 space-y-2 text-sm text-foreground">
                <p><span className="text-muted-foreground">Fase:</span> {project.phase}</p>
                <p><span className="text-muted-foreground">Dirección:</span> {project.address.street ? `${project.address.street}, ` : ""}{project.address.city}, {project.address.state}</p>
                <p><span className="text-muted-foreground">Equipo:</span> {project.team.join(", ")}</p>
              </div>
            </div>
          </aside>
        </div>

      </section>
    </main>
  );
}