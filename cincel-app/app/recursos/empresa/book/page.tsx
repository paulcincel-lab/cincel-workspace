import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";

export default async function EmpresaBookPage() {
  return <ResourcesWorkspaceServer mode="empresa" titleOverride="Book" descriptionOverride="Documentación base de Book." />;
}