import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { ProyectosClient } from "./ProyectosClient";

export default async function ProyectosPage() {
  // Server-rendered initial data — no client-side fetch waterfall on first paint.
  let initialProjects: Awaited<ReturnType<typeof fetchProjectsAction>> = [];
  let presaleAutoStart = false;
  const [projectsResult, workflowsResult] = await Promise.allSettled([fetchProjectsAction(), fetchWorkflowsAction()]);
  // Not authorized / no session — the client falls back to hydrating itself.
  if (projectsResult.status === "fulfilled") initialProjects = projectsResult.value;
  if (workflowsResult.status === "fulfilled") {
    presaleAutoStart = workflowsResult.value.find((w) => w.key === "presale")?.autoStart === "on_create";
  }

  // The create sheet says Presale starts on its own only while that setting is on.
  let presaleAutoStart = false;
  try {
    const workflows = await fetchWorkflowsAction();
    presaleAutoStart = workflows.some((w) => w.key === "presale" && w.active && w.autoStart === "on_create");
  } catch {
    // Without workflows the sheet just omits the auto-start sentence.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <ProyectosClient initialProjects={initialProjects} presaleAutoStart={presaleAutoStart} />
      </section>
    </main>
  );
}
