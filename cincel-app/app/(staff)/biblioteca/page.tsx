import { notFound } from "next/navigation";

import { BibliotecaIndex } from "@/components/biblioteca/BibliotecaIndex";
import { currentMonth } from "@/components/biblioteca/vacation-format";
import { IMPLEMENTED as VACATIONS_IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import { resolveResourcesCapabilities } from "@/lib/auth/permissions";
import { canViewBibliotecaSection } from "@/lib/biblioteca/catalog";
import { requireBibliotecaViewer } from "@/lib/biblioteca/load";
import { loadBibliotecaPageData } from "@/lib/loaders/biblioteca";
import { Hydrate } from "@/lib/query/hydrate";
import { bibliotecaLinksOptions, myVacationsOptions } from "@/lib/query/options/biblioteca";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { readMyVacations, type MyVacations } from "@/lib/vacations/reads";

/**
 * `/biblioteca` (redesign FE §3.7): Empresa + Recursos catalog in the new
 * shell. The links are prefetched with the page-data loader into
 * `biblioteca.links(null)` (personal links and Empresa filtered for the
 * viewer in SQL) and the index reads that query. The Mis vacaciones card
 * reads `me.vacations`, prefetched with the viewer's own vacations only (the
 * `mine` read of `getMisVacacionesPageData`, no team absences). A `?estilo=`
 * preview and the `?q=` search are read from the URL on the client (FE §4.2).
 */
export default async function BibliotecaPage() {
  const user = await requireBibliotecaViewer();
  if (!canViewBibliotecaSection(resolveResourcesCapabilities(user), null)) notFound();

  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, bibliotecaLinksOptions(null), () => loadBibliotecaPageData(user, { section: null })),
    prefetch<MyVacations | null>(qc, myVacationsOptions(currentMonth()), () =>
      VACATIONS_IMPLEMENTED.fetchMyVacationsAction ? readMyVacations(user) : Promise.resolve(null),
    ),
  ]);

  return (
    <Hydrate qc={qc}>
      <BibliotecaIndex />
    </Hydrate>
  );
}
