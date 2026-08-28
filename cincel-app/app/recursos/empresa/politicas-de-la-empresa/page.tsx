import ResourcesWorkspaceServer from "@/components/recursos/ResourcesWorkspaceServer";

export default async function EmpresaPoliticasPage() {
  return <ResourcesWorkspaceServer mode="empresa" titleOverride="Políticas de la empresa" descriptionOverride="Normas internas, acuerdos y políticas operativas." />;
}