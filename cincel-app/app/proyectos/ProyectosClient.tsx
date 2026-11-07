"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { ProjectCreateModal } from "@/components/proyectos/ProjectCreateModal";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { TramoBadge } from "@/components/v2/status/TramoBadge";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { KpiRow } from "@/components/v2/layout/KpiRow";
import { createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import ExportMenu from "@/components/ui/ExportMenu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { useProjectsData, type ProjectItem } from "@/lib/proyectos/use-projects-data";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import { canSeeAdminData, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import type { ProjectCreateInput, ProjectStatus, WorkflowRef } from "@/lib/types/core";

interface ProyectosClientProps {
  initialProjects: ProjectItem[];
  /** Presale starts on its own when a project is created; drives the create sheet's copy. */
  presaleAutoStart?: boolean;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  activo: "Activo",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
};

/** The project's current tramo, or null (`needsTramo`). */
export function currentTramoOf(project: ProjectItem): WorkflowRef | null {
  if (project.needsTramo) return null;
  return project.currentWorkflow ?? project.tramos.find((t) => t.current) ?? null;
}

export function ProyectosClient({ initialProjects, presaleAutoStart = false }: ProyectosClientProps) {
  const generalSettings = useGeneralSettings();
  const router = useRouter();
  const { projectsData, isLoadingData, authenticatedUser, updateProject, archiveProject, removeProject, addProject } =
    useProjectsData(initialProjects);
  const capabilities = useMemo(() => resolveProjectsCapabilities(authenticatedUser), [authenticatedUser]);
  // Client is admin-only data: non-admins get no Cliente column (not even hidden) and no Cliente in exports.
  const isAdmin = canSeeAdminData(authenticatedUser);
  const [view, setView] = useState<"activos" | "archivados">("activos");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const visible = useMemo(
    () =>
      projectsData.filter((p) =>
        view === "activos" ? p.status === "activo" || p.status === "pausado" : p.status === "completado" || p.status === "cancelado"
      ),
    [projectsData, view]
  );

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

  function bulkArchive() {
    selected.forEach((id) => void archiveProject(String(id), "completado"));
    setSelected(new Set());
  }

  function bulkReactivate() {
    selected.forEach((id) => void updateProject(String(id), { status: "activo" }));
    setSelected(new Set());
  }

  const exportColumns = useMemo<ExportColumn<ProjectItem>[]>(
    () => [
      { key: "project", header: "Proyecto", getValue: (p) => p.name },
      { key: "tramo", header: "Tramo", getValue: (p) => currentTramoOf(p)?.name ?? "Sin tramo" },
      { key: "activePhase", header: "Fase activa", getValue: (p) => p.activePhase?.name ?? "—" },
      { key: "manager", header: "Encargado", getValue: (p) => p.manager?.name ?? "Sin encargado" },
      { key: "openTasks", header: "Tareas abiertas", getValue: (p) => p.taskCounts.open },
      { key: "status", header: "Estado", getValue: (p) => STATUS_LABEL[p.status] },
      ...(isAdmin
        ? [{ key: "client", header: "Cliente", getValue: (p: ProjectItem) => p.client?.name ?? "Por asignar" }]
        : []),
    ],
    [isAdmin]
  );

  async function exportProjects(format: "xlsx" | "pdf") {
    await exportTableData({
      moduleName: "Proyectos",
      fileName: `proyectos-${view}-${Date.now()}`,
      format,
      companyName: generalSettings.company.tradeName || generalSettings.company.legalName,
      columns: exportColumns,
      rows: visible,
      landscape: true,
    });
  }

  const kpis = useMemo(() => {
    const active = projectsData.filter((p) => p.status === "activo");
    const managers = new Set(active.map((p) => p.manager?.id).filter(Boolean));
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
        id: "tramo",
        header: "Tramo",
        cell: ({ row }) => {
          const tramo = currentTramoOf(row.original);
          if (!tramo && isAdmin) {
            return (
              <Badge
                variant="destructive"
                render={
                  <Link
                    href={`/proyectos/${row.original.id}/ficha#tramos`}
                    onClick={(event) => event.stopPropagation()}
                  />
                }
              >
                Asignar tramo
              </Badge>
            );
          }
          return <TramoBadge tramo={tramo} />;
        },
      },
      {
        id: "activePhase",
        header: "Fase activa",
        cell: ({ row }) =>
          row.original.activePhase ? (
            row.original.activePhase.name
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "manager",
        header: "Encargado",
        cell: ({ row }) =>
          row.original.manager ? (
            <PersonAvatar name={row.original.manager.name} />
          ) : (
            <span className="text-muted-foreground">Sin encargado</span>
          ),
      },
      {
        id: "openTasks",
        header: "Tareas abiertas",
        cell: ({ row }) => {
          const { open, blocked } = row.original.taskCounts;
          return blocked > 0 ? (
            <span className="text-destructive">{open} ({blocked} bloqueadas)</span>
          ) : (
            <span>{open}</span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => <Badge variant="secondary">{STATUS_LABEL[row.original.status]}</Badge>,
      },
      ...(isAdmin
        ? [
            {
              id: "client",
              header: "Cliente",
              cell: ({ row }) =>
                row.original.client ? (
                  <span>{row.original.client.name}</span>
                ) : (
                  <Badge variant="destructive">Por asignar</Badge>
                ),
            } satisfies ColumnDef<ProjectItem, unknown>,
          ]
        : []),
      createRowActionsColumn<ProjectItem>((project) => {
        const isActive = project.status === "activo" || project.status === "pausado";
        const actions: RowAction<ProjectItem>[] = [
          { label: "Ver ficha", onSelect: (p) => router.push(`/proyectos/${p.id}/ficha`) },
        ];
        if (capabilities.canArchiveProject) {
          if (isActive) {
            actions.push(
              {
                label: "Archivar",
                separatorBefore: true,
                variant: "destructive",
                onSelect: (p) => void archiveProject(p.id, "completado"),
              },
              {
                label: "Cancelar",
                variant: "destructive",
                onSelect: (p) => void archiveProject(p.id, "cancelado"),
              }
            );
          } else {
            actions.push({
              label: "Reactivar",
              separatorBefore: true,
              onSelect: (p) => void updateProject(p.id, { status: "activo" }),
            });
          }
        }
        if (capabilities.canDeleteProject) {
          actions.push({
            label: "Eliminar",
            separatorBefore: true,
            variant: "destructive",
            onSelect: (p) => {
              if (window.confirm(`Se eliminará el proyecto "${p.name}". Esta acción no se puede deshacer. ¿Deseas continuar?`)) {
                void removeProject(p.id);
              }
            },
          });
        }
        return actions;
      }),
    ],
    [router, updateProject, archiveProject, removeProject, capabilities, selected, isAdmin]
  );

  async function handleCreate(input: ProjectCreateInput) {
    const created = await addProject(input);
    setShowCreate(false);
    if (created) router.push(`/proyectos/${created.id}/ficha`);
  }

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
            {capabilities.canCreateProject ? (
              <Button onClick={() => setShowCreate(true)}>+ Nuevo proyecto</Button>
            ) : null}
          </>
        }
      />

      <KpiRow
        tiles={[
          { label: "Proyectos activos", value: kpis.active },
          { label: "Encargados activos", value: kpis.managers },
        ]}
      />

      {capabilities.canArchiveProject ? (
        <BulkActionBar
          selectedCount={selected.size}
          itemLabel="proyectos"
          actions={
            view === "activos"
              ? [{ label: "Archivar", onClick: bulkArchive, variant: "destructive" }]
              : [{ label: "Reactivar", onClick: bulkReactivate }]
          }
        />
      ) : null}
      <DataTable
        columns={columns}
        data={visible}
        isLoading={isLoadingData}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/proyectos/${row.id}/ficha`)}
        wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
        emptyMessage={view === "activos" ? "No hay proyectos activos." : "No hay proyectos archivados."}
        searchPlaceholder="Filtrar por nombre de proyecto..."
      />

      {showCreate ? (
        <ProjectCreateModal
          onClose={() => setShowCreate(false)}
          onConfirm={handleCreate}
          presaleAutoStart={presaleAutoStart}
        />
      ) : null}
    </div>
  );
}
