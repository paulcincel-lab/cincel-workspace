import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function EmpresaManualPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/recursos/empresa/manual-de-la-empresa", searchParams);
  return <ResourcesWorkspaceServer mode="empresa" titleOverride="Manual de la empresa" descriptionOverride="Lineamientos, procesos y referencia institucional." />;
}