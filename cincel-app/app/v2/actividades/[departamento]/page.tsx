import { notFound } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchActivitiesAction } from "@/lib/actions/activities-actions";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { fetchTeamMembersAction } from "@/lib/actions/team-actions";
import { getDepartamento } from "@/lib/actividades/departamento";
import { ActividadesV2Client } from "./ActividadesV2Client";

export default async function ActividadesV2Page({
  params,
}: {
  params: Promise<{ departamento: string }>;
}) {
  const { departamento: slug } = await params;
  const departamento = getDepartamento(slug);
  if (!departamento) notFound();

  let initialTasks: Awaited<ReturnType<typeof fetchActivitiesAction>> = [];
  let initialProjects: Awaited<ReturnType<typeof fetchProjectsAction>> = [];
  let initialTeam: Awaited<ReturnType<typeof fetchTeamMembersAction>> = [];
  if (departamento.workflow) {
    try {
      [initialTasks, initialProjects, initialTeam] = await Promise.all([
        fetchActivitiesAction(departamento.workflow),
        fetchProjectsAction(),
        fetchTeamMembersAction(),
      ]);
    } catch {
      // Not authorized / no session — the client falls back to hydrating itself.
    }
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <ActividadesV2Client
          slug={slug}
          initialTasks={initialTasks}
          initialProjects={initialProjects}
          initialTeam={initialTeam}
        />
      </section>
    </main>
  );
}
