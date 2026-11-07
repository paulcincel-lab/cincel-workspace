import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function EmpresaBookPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/recursos/empresa/book", searchParams);
  return <ResourcesWorkspaceServer mode="empresa" titleOverride="Book" descriptionOverride="Documentación base de Book." />;
}