import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";

export default async function EmpresaManualPage() {
  return <ResourcesWorkspaceServer mode="empresa" titleOverride="Manual de la empresa" descriptionOverride="Lineamientos, procesos y referencia institucional." />;
}