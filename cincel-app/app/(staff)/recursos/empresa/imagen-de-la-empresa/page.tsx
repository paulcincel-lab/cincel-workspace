import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function EmpresaImagenPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/recursos/empresa/imagen-de-la-empresa", searchParams);
  return <ResourcesWorkspaceServer mode="empresa" titleOverride="Imagen de la empresa" descriptionOverride="Activos visuales, marca y materiales de identidad." />;
}