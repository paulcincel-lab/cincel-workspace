import { notFound } from "next/navigation";

import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { ResourceSection } from "@/lib/types/resource";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

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
  await redirectLegacyIfRedesignOn(`/recursos/${seccion}`, searchParams);
  return <ResourcesWorkspaceServer mode={seccion as ResourceSection} />;
}
