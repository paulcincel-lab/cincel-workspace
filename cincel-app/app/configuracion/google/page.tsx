import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { GoogleWorkspaceSettings } from "@/components/configuracion/GoogleWorkspaceSettings";
import { fetchAreasAction } from "@/lib/actions/areas-actions";
import { getGoogleHealthAction, listGroupMappingsAction } from "@/lib/actions/workspace-access-actions";
import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";

/** Administrador only: `AppRouteGuard` gates `/configuracion/*` and every action re-checks the role. */
export default async function ConfiguracionGooglePage() {
  let mappings: GroupMapping[] = [];
  let areas: { id: string; name: string }[] = [];
  let health: GoogleHealth | null = null;
  try {
    const [mappingRows, areaRows] = await Promise.all([listGroupMappingsAction(), fetchAreasAction()]);
    mappings = mappingRows;
    areas = areaRows.map((area) => ({ id: area.id, name: area.name }));
  } catch {
    // Not authorized or no session: the guard redirects and nothing is loaded.
  }
  try {
    health = await getGoogleHealthAction();
  } catch {
    // Not authorized, or the health query failed: Estado shows its error state.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <GoogleWorkspaceSettings mappings={mappings} areas={areas} health={health} />
      </section>
    </main>
  );
}
