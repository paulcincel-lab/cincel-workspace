import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchTeamMembersAction } from "@/lib/actions/team-actions";
import { EquipoV2Client } from "./EquipoV2Client";

export default async function EquipoV2Page() {
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
        <EquipoV2Client initialTeam={initialTeam} />
      </section>
    </main>
  );
}
