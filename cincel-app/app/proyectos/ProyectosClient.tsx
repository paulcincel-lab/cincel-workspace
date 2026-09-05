"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { ProjectCreateModal } from "@/components/proyectos/ProjectCreateModal";
import { ProjectNotesModal } from "@/components/proyectos/ProjectNotesModal";
import { fetchClients } from "@/lib/repositories/clients-repository";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { KpiRow } from "@/components/v2/layout/KpiRow";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { Button } from "@/components/ui/shadcn/button";
import ExportMenu from "@/components/ui/ExportMenu";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs";
import { useProjectsData, normalizeName, type ProjectItem } from "@/lib/proyectos/use-projects-data";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import type { ProjectStage, ProjectStatus } from "@/lib/types/enums";

interface ProyectosClientProps {
  initialProjects: ProjectItem[];
}

const PROJECT_TYPE_OPTIONS = ["Habitacional", "Oficinas", "Comercial", "Mobiliario", "Mantenimiento", "Otro"];

/** Earliest upcoming task commitment date for a project, or null. */
function nextDeliveryFor(project: ProjectItem, allTasks: ReturnType<typeof useProjectsData>["allTasks"]) {
  const dates = allTasks
    .filter((t) => t.project === project.name && !t.archived && t.commitmentDate)
    .map((t) => t.commitmentDate)
    .sort();
  return dates[0] ?? null;
}

export function ProyectosClient({ initialProjects }: ProyectosClientProps) {
  const router = useRouter();
  const {
    projectsData,
    allTasks,
    isLoadingData,
    updateProjectActive,
    activeTeamNames,
    addProject,
    notesByProject,
    addNote,
    secondaryCoordinatorByProject,
  } = useProjectsData(initialProjects);
  const [view, setView] = useState<"activos" | "archivados">("activos");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [notesProjectId, setNotesProjectId] = useState<number | null>(null);
  const notesProject = projectsData.find((p) => p.id === notesProjectId) ?? null;

  const visible = useMemo(
    () => projectsData.filter((p) => (view === "activos" ? p.active : !p.active)),
    [projectsData, view]
  );

  const { data: manualClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchClients(),
  });

  const activeClientOptions = useMemo(() => {
    const fromProjects = projectsData
      .filter((p) => p.active)
      .map((p) => ({
        id: p.client.id,
        name: p.client.name,
        kind: (p.client.kind === "Empresa" ? "Empresa" : "Particular") as "Empresa" | "Particular",
      }));
    const fromManual = manualClients
      .filter((c) => Boolean(c.hasActiveProject))
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind as "Empresa" | "Particular" }));
    const deduped = new Map<string, (typeof fromProjects)[number]>();
    for (const client of [...fromProjects, ...fromManual]) {
      const key = client.name.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, client);
    }
    return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projectsData, manualClients]);

  function toggle(id: string | number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: (string | number)[]) {
    setSelected((cur) => {
      const allSelected = ids.every((id) => cur.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  function bulkSetActive(active: boolean) {
    selected.forEach((id) => updateProjectActive(Number(id), active));
    setSelected(new Set());
  }

  const exportColumns = useMemo<ExportColumn<ProjectItem>[]>(
    () => [
      { key: "project", header: "Proyecto", getValue: (p) => p.name },
      { key: "client", header: "Cliente", getValue: (p) => p.client.name },
      { key: "stage", header: "Etapa", getValue: (p) => p.stage },
      { key: "designLeader", header: "Lider de diseño", getValue: (p) => normalizeName(p.coordinator) || "Sin encargado" },
      {
        key: "constructionLeader",
        header: "Lider de construcción",
        getValue: (p) => secondaryCoordinatorByProject[p.id] || "Sin encargado",
      },
      { key: "status", header: "Estado", getValue: (p) => (p.active ? "Proyecto activo" : "Proyecto archivado") },
    ],
    [secondaryCoordinatorByProject]
  );

  async function exportProjects(format: "xlsx" | "pdf") {
    const { settings } = loadGeneralSettings();
    await exportTableData({
      moduleName: "Proyectos",
      fileName: `proyectos-${view}-${Date.now()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: exportColumns,
      rows: visible,
      landscape: true,
    });
  }

  const kpis = useMemo(() => {
    const active = projectsData.filter((p) => p.active);
    const managers = new Set(active.map((p) => p.coordinator).filter(Boolean));
    return { active: active.length, managers: managers.size };
  }, [projectsData]);

  const columns = useMemo<ColumnDef<ProjectItem, unknown>[]>(
    () => [
      createSelectionColumn<ProjectItem>({
        getId: (p) => p.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
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
        id: "coordinator",
        header: "Líder de diseño",
        cell: ({ row }) =>
          row.original.coordinator ? (
            <PersonAvatar name={row.original.coordinator} />
          ) : (
            <span className="text-muted-foreground">Sin encargado</span>
          ),
      },
      {
        id: "constructionLeader",
        header: "Líder de construcción",
        cell: ({ row }) => {
          const name = secondaryCoordinatorByProject[row.original.id];
          return name ? (
            <PersonAvatar name={name} />
          ) : (
            <span className="text-muted-foreground">Sin encargado</span>
          );
        },
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
        { label: "Notas", onSelect: (p) => setNotesProjectId(p.id) },
        {
          label: project.active ? "Archivar" : "Reactivar",
          separatorBefore: true,
          variant: project.active ? "destructive" : "default",
          onSelect: (p) => updateProjectActive(p.id, !p.active),
        },
      ]),
    ],
    [allTasks, router, updateProjectActive, selected, secondaryCoordinatorByProject]
  );

  return (
    <div>
      <PageHeader
        title="Proyectos"
        description="Vista operativa para riesgo, entregas y carga por proyecto."
        actions={
          <>
            <Tabs
              value={view}
              onValueChange={(v) => {
                setView(v as typeof view);
                setSelected(new Set());
              }}
            >
              <TabsList>
                <TabsTrigger value="activos">Activos</TabsTrigger>
                <TabsTrigger value="archivados">Archivados</TabsTrigger>
              </TabsList>
            </Tabs>
            <ExportMenu onExport={exportProjects} />
            <Button onClick={() => setShowCreate(true)}>+ Nuevo proyecto</Button>
          </>
        }
      />

      <KpiRow
        tiles={[
          { label: "Proyectos activos", value: kpis.active },
          { label: "Encargados activos", value: kpis.managers },
        ]}
      />

      <BulkActionBar
        selectedCount={selected.size}
        itemLabel="proyectos"
        actions={
          view === "activos"
            ? [{ label: "Archivar", onClick: () => bulkSetActive(false), variant: "destructive" }]
            : [{ label: "Reactivar", onClick: () => bulkSetActive(true) }]
        }
      />
      <DataTable
        columns={columns}
        data={visible}
        isLoading={isLoadingData}
        getRowId={(row) => String(row.id)}
        onRowClick={(row) => router.push(`/proyectos/${row.id}/ficha`)}
        wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
        emptyMessage={view === "activos" ? "No hay proyectos activos." : "No hay proyectos archivados."}
        searchPlaceholder="Filtrar por nombre de proyecto..."
      />

      {showCreate ? (
        <ProjectCreateModal
          activeClientOptions={activeClientOptions}
          activeTeamNames={activeTeamNames}
          projectTypeOptions={PROJECT_TYPE_OPTIONS}
          existingProjectIds={projectsData.map((p) => p.id)}
          existingClientIds={projectsData.map((p) => p.client.id)}
          onClose={() => setShowCreate(false)}
          onConfirm={(project) => {
            addProject(project);
            setShowCreate(false);
            router.push(`/proyectos/${project.id}/ficha`);
          }}
        />
      ) : null}

      {notesProject ? (
        <ProjectNotesModal
          projectName={notesProject.name}
          notes={notesByProject[notesProject.id] ?? []}
          onClose={() => setNotesProjectId(null)}
          onSave={(content) => addNote(notesProject.id, content)}
        />
      ) : null}
    </div>
  );
}
