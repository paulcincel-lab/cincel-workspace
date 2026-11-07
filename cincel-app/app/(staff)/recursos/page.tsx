import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

/**
 * Same card/tile workspace as /recursos/empresa (#437): section folders, Drive
 * browser and recent documents. Each section opens at /recursos/<seccion>.
 */
export default async function RecursosPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/recursos", searchParams);
  return <ResourcesWorkspaceServer mode="overview" />;
}
