import { PermisosSettings } from "@/components/ajustes/PermisosSettings";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { buildDefaultPermissionsState } from "@/lib/auth/permissionsState";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Permisos (redesign FE §3.8): the existing permissions editor,
 * restyled; storage unchanged. The segment layout guards it; the Ajustes
 * layout renders the header and `AjustesNav`.
 */
export default async function AjustesPermisosPage() {

  let initialStaff: Awaited<ReturnType<typeof fetchStaffAction>> = [];
  try {
    initialStaff = await fetchStaffAction({ includeInactive: true });
  } catch {
    // The client hydrates itself on mount, like the legacy page.
  }

  // Built here so the client receives plain data instead of running every capability resolver for every role.
  const defaultPermissions = buildDefaultPermissionsState();

  return <PermisosSettings initialStaff={initialStaff} defaultPermissions={defaultPermissions} />;
}
