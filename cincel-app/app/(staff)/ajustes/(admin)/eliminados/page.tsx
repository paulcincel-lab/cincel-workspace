import { DeletedProjectsSettings } from "@/components/ajustes/DeletedProjectsSettings";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { Hydrate } from "@/lib/query/hydrate";
import { deletedProjectsOptions } from "@/lib/query/options/proyectos";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { listDeletedProjects } from "@/lib/repositories/projects-repository";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Proyectos eliminados (#1050): the projects deleted in the last 30
 * days, each with "Restaurar". Administrador only, checked by the segment
 * layout, here and again by the read and the restore action. Prefetches
 * `qk.proyectos.deleted()`, so the client makes no call on mount.
 */
export default async function AjustesEliminadosPage() {
  await requireSettingsAdminPage();
  const qc = getQueryClient();
  await prefetch(qc, deletedProjectsOptions(), () => listDeletedProjects());
  return (
    <Hydrate qc={qc}>
      <DeletedProjectsSettings />
    </Hydrate>
  );
}
