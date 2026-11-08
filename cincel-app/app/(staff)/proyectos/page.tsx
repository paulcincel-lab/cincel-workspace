import { notFound } from "next/navigation";

import { ProjectsPortfolio } from "@/components/proyectos/ProjectsPortfolio";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectosPage } from "@/lib/loaders/proyectos";
import { Hydrate } from "@/lib/query/hydrate";
import { proyectosPageOptions } from "@/lib/query/options/proyectos";
import { getQueryClient, prefetch } from "@/lib/query/server";

/**
 * `/proyectos` (FE §3.5): the three-style portfolio. One page-data read,
 * `qk.proyectos.list()`, prefetched here through its loader and hydrated, so
 * the first render makes no client call. `?q=` and `?nuevo=1` are client
 * state over the loaded rows. The `(staff)` layout mounts `AppShell` around it.
 */
export default async function ProyectosPage() {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canViewProjects) notFound();

  const qc = getQueryClient();
  await prefetch(qc, proyectosPageOptions(), () => loadProyectosPage(user));

  return (
    <Hydrate qc={qc}>
      <ProjectsPortfolio />
    </Hydrate>
  );
}
