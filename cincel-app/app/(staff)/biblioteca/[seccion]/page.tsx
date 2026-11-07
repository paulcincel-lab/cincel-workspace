import { notFound, redirect } from "next/navigation";

import { BibliotecaSection } from "@/components/biblioteca/BibliotecaSection";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { canViewResourceSection } from "@/lib/auth/permissions";
import { isBibliotecaSection, parseEstilo, parseTipo, parseTramo } from "@/lib/biblioteca/catalog";
import { loadBibliotecaData } from "@/lib/biblioteca/load";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

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
  await redirectIfRedesignOff(`/biblioteca/${seccion}`, sp);

  if (seccion === "mis-vacaciones") redirect("/biblioteca/vacaciones");
  if (seccion === "empresa") redirect("/biblioteca");
  if (!isBibliotecaSection(seccion)) notFound();

  const { links, capabilities, viewerId, driveEnabled } = await loadBibliotecaData();
  if (!canViewResourceSection({ capabilities, section: seccion })) notFound();

  const view = (
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
  const estilo = parseEstilo(sp.estilo);
  return estilo ? (
    <StyleProvider style={estilo} scope="staff" isOverridden>
      {view}
    </StyleProvider>
  ) : (
    view
  );
}
