import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function EmpresaPoliticasPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/recursos/empresa/politicas-de-la-empresa", searchParams);
  return <ResourcesWorkspaceServer mode="empresa" titleOverride="Políticas de la empresa" descriptionOverride="Normas internas, acuerdos y políticas operativas." />;
}