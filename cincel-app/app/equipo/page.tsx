import EquipoPageClient from "./EquipoPageClient";
import { fetchTeamMembersAction } from "@/lib/actions/team-actions";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";

export default async function EquipoPage() {
  let initialTeam: Awaited<ReturnType<typeof fetchTeamMembersAction>> = [];
  let initialProjects: Awaited<ReturnType<typeof fetchProjectsAction>> = [];
  try {
    [initialTeam, initialProjects] = await Promise.all([
      fetchTeamMembersAction(),
      fetchProjectsAction(),
    ]);
  } catch {
    // Not authorized / no session — the client hydrates itself.
  }

  return (
    <EquipoPageClient initialTeam={initialTeam} initialProjects={initialProjects} />
  );
}
