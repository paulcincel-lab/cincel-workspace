import PermissionsWorkspace from "@/components/configuracion/PermissionsWorkspace";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { buildDefaultPermissionsState } from "@/lib/auth/permissionsState";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function ConfiguracionPermisosPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/configuracion/permisos", searchParams);
  let initialStaff: Awaited<ReturnType<typeof fetchStaffAction>> = [];
  try {
    initialStaff = await fetchStaffAction({ includeInactive: true });
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  // Built here so the client receives plain data instead of running every capability resolver for every role.
  const defaultPermissions = buildDefaultPermissionsState();

  return <PermissionsWorkspace initialStaff={initialStaff} defaultPermissions={defaultPermissions} />;
}
