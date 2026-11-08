import { notFound, redirect } from "next/navigation";

import { BibliotecaSection } from "@/components/biblioteca/BibliotecaSection";
import { canViewResourceSection } from "@/lib/auth/permissions";
import { isBibliotecaSection, parseTipo, parseTramo } from "@/lib/biblioteca/catalog";
import { loadBibliotecaData } from "@/lib/biblioteca/load";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/biblioteca/[seccion]` (redesign FE §3.7): one Recursos section
 * (`formacion`, `formatos-obra`, `plantillas-diseno`, `mis-documentos`,
 * `mis-favoritos`). `mis-vacaciones` lives at `/biblioteca/vacaciones` and
 * `empresa` on the index. Auth: `canViewResourceSection`.
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

  const { links, capabilities, viewerId, driveEnabled } = await loadBibliotecaData();
  if (!canViewResourceSection({ capabilities, section: seccion })) notFound();

  return (
    <BibliotecaSection
      section={seccion}
      links={links}
      viewerId={viewerId}
      canManageFavorites={capabilities.canManageFavoritesSection}
      driveEnabled={driveEnabled}
      tipo={parseTipo(sp.tipo)}
      tramo={parseTramo(sp.tramo)}
    />
  );
}
