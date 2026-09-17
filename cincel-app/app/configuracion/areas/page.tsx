import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchAreasAction } from "@/lib/actions/areas-actions";
import { AreasClient } from "./AreasClient";

export default async function ConfiguracionAreasPage() {
  let initialAreas: Awaited<ReturnType<typeof fetchAreasAction>> = [];
  try {
    initialAreas = await fetchAreasAction({ includeInactive: true });
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <AreasClient initialAreas={initialAreas} />
      </section>
    </main>
  );
}
