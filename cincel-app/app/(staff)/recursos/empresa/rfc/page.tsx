import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function EmpresaRFCPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/recursos/empresa/rfc", searchParams);
  return <ResourcesWorkspaceServer mode="empresa" titleOverride="RFC" descriptionOverride="Datos fiscales y documentación administrativa." />;
}