import PermissionsWorkspace from "@/components/configuracion/PermissionsWorkspace";
import { fetchStaffAction } from "@/lib/actions/staff-actions";

export default async function ConfiguracionPermisosPage() {
  let initialStaff: Awaited<ReturnType<typeof fetchStaffAction>> = [];
  try {
    initialStaff = await fetchStaffAction({ includeInactive: true });
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return <PermissionsWorkspace initialStaff={initialStaff} />;
}
