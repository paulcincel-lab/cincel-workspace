"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { KpiRow } from "@/components/v2/layout/KpiRow";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import { Button } from "@/components/ui/shadcn/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs";
import { useProjectsData, type ProjectItem } from "@/lib/proyectos/use-projects-data";
import type { ProjectStage, ProjectStatus } from "@/lib/types/enums";

interface ProyectosV2ClientProps {
  initialProjects: ProjectItem[];
}

/** Earliest upcoming task commitment date for a project, or null. */
function nextDeliveryFor(project: ProjectItem, allTasks: ReturnType<typeof useProjectsData>["allTasks"]) {
  const dates = allTasks
    .filter((t) => t.project === project.name && !t.archived && t.commitmentDate)
    .map((t) => t.commitmentDate)
    .sort();
  return dates[0] ?? null;
}

export function ProyectosV2Client({ initialProjects }: ProyectosV2ClientProps) {
  const router = useRouter();
  const { projectsData, allTasks, isLoadingData, updateProjectActive } =
    useProjectsData(initialProjects);
  const [view, setView] = useState<"activos" | "archivados">("activos");

  const visible = useMemo(
    () => projectsData.filter((p) => (view === "activos" ? p.active : !p.active)),
    [projectsData, view]
  );

  const kpis = useMemo(() => {
    const active = projectsData.filter((p) => p.active);
    const managers = new Set(active.map((p) => p.manager).filter(Boolean));
    return { active: active.length, managers: managers.size };
  }, [projectsData]);

  const columns = useMemo<ColumnDef<ProjectItem, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Proyecto",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "client",
        header: "Cliente",
        cell: ({ row }) => row.original.client?.name ?? "—",
      },
      {
        accessorKey: "stage",
        header: "Etapa",
        cell: ({ row }) => (
          <StatusBadge kind="project-stage" value={row.original.stage as ProjectStage} />
        ),
      },
      {
        id: "manager",
        header: "Responsable",
        cell: ({ row }) =>
          row.original.manager ? (
            <PersonAvatar name={row.original.manager} />
          ) : (
            <span className="text-muted-foreground">Sin encargado</span>
          ),
      },
      {
        id: "nextDelivery",
        header: "Próxima entrega",
        cell: ({ row }) => {
          const date = nextDeliveryFor(row.original, allTasks);
          return (
            <span className={date ? undefined : "text-muted-foreground"}>
              {date ? new Date(date).toLocaleDateString("es-MX") : "Sin fecha"}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => (
          <StatusBadge kind="project-status" value={row.original.status as ProjectStatus} />
        ),
      },
      createRowActionsColumn<ProjectItem>((project) => [
        { label: "Ver ficha", onSelect: (p) => router.push(`/proyectos/${p.id}/ficha`) },
        { label: "Ver actividades", onSelect: (p) => router.push(`/proyectos/${p.id}`) },
        {
          label: project.active ? "Archivar" : "Reactivar",
          separatorBefore: true,
          variant: project.active ? "destructive" : "default",
          onSelect: (p) => updateProjectActive(p.id, !p.active),
        },
      ]),
    ],
    [allTasks, router, updateProjectActive]
  );

  return (
    <div>
      <PageHeader
        title="Proyectos"
        description="Vista operativa para riesgo, entregas y carga por proyecto."
        actions={
          <>
            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
              <TabsList>
                <TabsTrigger value="activos">Activos</TabsTrigger>
                <TabsTrigger value="archivados">Archivados</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button>+ Nuevo proyecto</Button>
          </>
        }
      />

      <KpiRow
        tiles={[
          { label: "Proyectos activos", value: kpis.active },
          { label: "Encargados activos", value: kpis.managers },
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        isLoading={isLoadingData}
        getRowId={(row) => String(row.id)}
        onRowClick={(row) => router.push(`/proyectos/${row.id}/ficha`)}
        emptyMessage={view === "activos" ? "No hay proyectos activos." : "No hay proyectos archivados."}
      />
    </div>
  );
}
