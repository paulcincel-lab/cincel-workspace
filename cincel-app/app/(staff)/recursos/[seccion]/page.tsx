import { notFound, redirect } from "next/navigation";

import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { ResourceSection } from "@/lib/types/resource";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

// `empresa` has its own static route (app/recursos/empresa) with sub-pages.
const SECTIONS: ReadonlySet<string> = new Set<ResourceSection>([
  "mis-documentos",
  "mis-favoritos",
  "plantillas-diseno",
  "formatos-obra",
  "mis-vacaciones",
  "formacion",
]);

export default async function RecursosSeccionPage({
  params,
  searchParams,
}: { params: Promise<{ seccion: string }> } & LegacyPageProps) {
  const { seccion } = await params;
  if (!SECTIONS.has(seccion)) notFound();
  // Redesign on: the old vacations section lives at /biblioteca/vacaciones (FE §2.2).
  if (seccion === "mis-vacaciones" && (await getResolvedAppearance()).redesignEnabled) {
    redirect("/biblioteca/vacaciones");
  }
  await redirectLegacyIfRedesignOn(`/recursos/${seccion}`, searchParams);
  return <ResourcesWorkspaceServer mode={seccion as ResourceSection} />;
}
