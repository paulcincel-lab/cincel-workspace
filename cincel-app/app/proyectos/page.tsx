import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import ProjectsTable from "@/components/proyectos/ProjectsTable";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";

export default async function ProyectosPage() {
  // Server-rendered initial data — no client-side fetch waterfall on first paint.
  let initialProjects: Awaited<ReturnType<typeof fetchProjectsAction>> = [];
  try {
    initialProjects = await fetchProjectsAction();
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">

        <Header />

        <ProjectsTable initialProjects={initialProjects} />

      </section>

    </main>
  );
}
