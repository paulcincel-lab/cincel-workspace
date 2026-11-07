import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";

export default async function EmpresaRFCPage() {
  return <ResourcesWorkspaceServer mode="empresa" titleOverride="RFC" descriptionOverride="Datos fiscales y documentación administrativa." />;
}