import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { EquipoClient } from "./EquipoClient";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function EquipoPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/equipo", searchParams);
  let initialTeam: Awaited<ReturnType<typeof fetchStaffAction>> = [];
  try {
    initialTeam = await fetchStaffAction({ includeInactive: true });
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
