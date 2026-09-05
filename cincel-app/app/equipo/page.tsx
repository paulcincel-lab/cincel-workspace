import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchTeamMembersAction } from "@/lib/actions/team-actions";
import { EquipoClient } from "./EquipoClient";

export default async function EquipoPage() {
  let initialTeam: Awaited<ReturnType<typeof fetchTeamMembersAction>> = [];
  try {
    initialTeam = await fetchTeamMembersAction();
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <EquipoClient initialTeam={initialTeam} />
      </section>
    </main>
  );
}
