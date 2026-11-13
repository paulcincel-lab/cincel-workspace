import { notFound, redirect } from "next/navigation";

import { BibliotecaSection } from "@/components/biblioteca/BibliotecaSection";
import { canViewResourceSection, resolveResourcesCapabilities } from "@/lib/auth/permissions";
import { isBibliotecaSection, parseTipo, parseTramo } from "@/lib/biblioteca/catalog";
import { requireBibliotecaViewer } from "@/lib/biblioteca/load";
import type { DriveStatus } from "@/lib/google/use-drive-status";
import { loadBibliotecaPageData } from "@/lib/loaders/biblioteca";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { bibliotecaLinksOptions } from "@/lib/query/options/biblioteca";
import { getQueryClient } from "@/lib/query/server";
import { pickEtapaParam } from "@/lib/ui/etapa-param";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/biblioteca/[seccion]` (redesign FE §3.7): one Recursos section
 * (`formacion`, `formatos-obra`, `plantillas-diseno`, `mis-documentos`,
 * `mis-favoritos`). `mis-vacaciones` lives at `/biblioteca/vacaciones` and
 * `empresa` on the index. Auth: `canViewResourceSection`. The page ships
 * only this section's links plus the viewer's favorites
 * (`biblioteca.links(seccion)`), and seeds the Drive status it already knows.
 */
export default async function BibliotecaSeccionPage({
  params,
  searchParams,
}: {
  params: Promise<{ seccion: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ seccion }, sp] = await Promise.all([params, searchParams]);

  if (seccion === "mis-vacaciones") redirect("/biblioteca/vacaciones");
  if (seccion === "empresa") redirect("/biblioteca");
  if (!isBibliotecaSection(seccion)) notFound();

  const user = await requireBibliotecaViewer();
  if (!canViewResourceSection({ capabilities: resolveResourcesCapabilities(user), section: seccion })) notFound();

  const qc = getQueryClient();
  const data = await loadBibliotecaPageData(user, { section: seccion });
  qc.setQueryData(bibliotecaLinksOptions(seccion).queryKey, data);
  qc.setQueryData<DriveStatus>(qk.google.driveStatus(), { configured: data.driveEnabled });

  return (
    <Hydrate qc={qc}>
      <BibliotecaSection section={seccion} tipo={parseTipo(sp.tipo)} tramo={parseTramo(pickEtapaParam(sp))} />
    </Hydrate>
  );
}
