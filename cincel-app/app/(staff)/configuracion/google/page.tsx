import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { GoogleWorkspaceSettings } from "@/components/configuracion/GoogleWorkspaceSettings";
import { fetchPositionsAction } from "@/lib/actions/positions-actions";
import { getGoogleHealthAction, listGroupMappingsAction } from "@/lib/actions/workspace-access-actions";
import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";

/** Administrador only: `AppRouteGuard` gates `/configuracion/*` and every action re-checks the role. */
export default async function ConfiguracionGooglePage() {
  let mappings: GroupMapping[] = [];
  let positions: { id: string; name: string }[] = [];
  let health: GoogleHealth | null = null;
  try {
    const [mappingRows, positionRows] = await Promise.all([listGroupMappingsAction(), fetchPositionsAction()]);
    mappings = mappingRows;
    positions = positionRows
      .filter((position) => position.active || position.googleManaged)
      .map((position) => ({ id: position.id, name: position.name }));
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
        <GoogleWorkspaceSettings mappings={mappings} positions={positions} health={health} />
      </section>
    </main>
  );
}
