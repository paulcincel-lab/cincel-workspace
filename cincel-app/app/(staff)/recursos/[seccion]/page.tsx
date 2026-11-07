import { notFound } from "next/navigation";

import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { ResourceSection } from "@/lib/types/resource";

// `empresa` has its own static route (app/recursos/empresa) with sub-pages.
const SECTIONS: ReadonlySet<string> = new Set<ResourceSection>([
  "mis-documentos",
  "mis-favoritos",
  "plantillas-diseno",
  "formatos-obra",
  "mis-vacaciones",
  "formacion",
]);

export default async function RecursosSeccionPage({ params }: { params: Promise<{ seccion: string }> }) {
  const { seccion } = await params;
  if (!SECTIONS.has(seccion)) notFound();
  return <ResourcesWorkspaceServer mode={seccion as ResourceSection} />;
}
