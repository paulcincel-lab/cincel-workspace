import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function RecursosEmpresaPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/recursos/empresa", searchParams);
  return <ResourcesWorkspaceServer mode="empresa" />;
}
