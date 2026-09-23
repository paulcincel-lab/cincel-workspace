import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";

/**
 * Same card/tile workspace as /recursos/empresa (#437): section folders, Drive
 * browser and recent documents. Each section opens at /recursos/<seccion>.
 */
export default async function RecursosPage() {
  return <ResourcesWorkspaceServer mode="overview" />;
}
