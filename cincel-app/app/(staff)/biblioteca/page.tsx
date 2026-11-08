import { notFound } from "next/navigation";

import { BibliotecaIndex } from "@/components/biblioteca/BibliotecaIndex";
import { resolveResourcesCapabilities } from "@/lib/auth/permissions";
import { canViewBibliotecaSection } from "@/lib/biblioteca/catalog";
import { requireBibliotecaViewer } from "@/lib/biblioteca/load";
import { loadBibliotecaPageData } from "@/lib/loaders/biblioteca";
import { Hydrate } from "@/lib/query/hydrate";
import { bibliotecaLinksOptions } from "@/lib/query/options/biblioteca";
import { getQueryClient, prefetch } from "@/lib/query/server";

/**
 * `/biblioteca` (redesign FE §3.7): Empresa + Recursos catalog in the new
 * shell. The links are prefetched with the page-data loader into
 * `biblioteca.links(null)` (personal links and Empresa filtered for the
 * viewer in SQL) and the index reads that query. A `?estilo=` preview is
 * read from the URL on the client (FE §4.2).
 */
export default async function BibliotecaPage() {
  const user = await requireBibliotecaViewer();
  if (!canViewBibliotecaSection(resolveResourcesCapabilities(user), null)) notFound();

  const qc = getQueryClient();
  await prefetch(qc, bibliotecaLinksOptions(null), () => loadBibliotecaPageData(user, { section: null }));

  return (
    <Hydrate qc={qc}>
      <BibliotecaIndex />
    </Hydrate>
  );
}
