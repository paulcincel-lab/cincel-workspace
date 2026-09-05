"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { KpiRow } from "@/components/v2/layout/KpiRow";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { Progress } from "@/components/ui/shadcn/progress";
import { Badge } from "@/components/ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { MemberProfileModal } from "@/components/equipo/MemberProfileModal";
import { MemberEditorDrawer } from "@/components/equipo/MemberEditorDrawer";
import { CoordinatorProjectsModal } from "@/components/equipo/CoordinatorProjectsModal";
import { Button } from "@/components/ui/shadcn/button";
import ExportMenu from "@/components/ui/ExportMenu";
import { useProjectsData } from "@/lib/proyectos/use-projects-data";
import { useMemberEditor } from "@/lib/equipo/use-member-editor";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import type { TeamAvailability, TeamMember } from "@/lib/data/team";
import type { TeamMemberWithWorkload } from "@/lib/equipo/types";

const AVAILABILITY_OPTIONS: TeamAvailability[] = [
  "Disponible",
  "Medio Tiempo",
  "Mixto",
  "No disponible",
  "Vacaciones",
  "Permiso",
  "Capacitacion",
  "Home Office",
];

function loadLabel(percent: number, isActive: boolean): string {
  if (!isActive) return "Inactivo";
  if (percent >= 100) return "Saturado";
  if (percent >= 75) return "Carga alta";
  return "Disponible";
}

interface EquipoV2ClientProps {
  initialTeam: TeamMember[];
}

const AVAILABILITY_VARIANT: Record<string, "success" | "secondary" | "outline"> = {
  Disponible: "success",
  Mixto: "secondary",
};

export function EquipoV2Client({ initialTeam }: EquipoV2ClientProps) {
  const [members, setMembers] = useState<TeamMember[]>(initialTeam);
  const { allTasks, projectsData, secondaryCoordinatorByProject } = useProjectsData();
  const [view, setView] = useState<"activos" | "desactivados">("activos");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [profileMemberId, setProfileMemberId] = useState<number | null>(null);
  const [coordinatorMemberId, setCoordinatorMemberId] = useState<number | null>(null);
  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const {
    showEditor,
    editingId,
    draft,
    setDraft,
    formError,
    accessPreviewState,
    isEditingSelfProtectedAdmin,
    teamCapabilities,
    openAddEditor,
    openEditEditor,
    closeEditor,
    saveMember,
  } = useMemberEditor({ members, setMembers, authenticatedUser });

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

  const activeTasks = useMemo(() => allTasks.filter((t) => !t.archived), [allTasks]);

  const withWorkload = useMemo<TeamMemberWithWorkload[]>(
    () =>
      members.map((member) => {
        const assigned = activeTasks.filter((t) => t.manager === member.name).length;
        const support = activeTasks.filter((t) => t.support.includes(member.name)).length;
        const total = assigned + support;
        const occupancy = Math.round((total / Math.max(member.capacity, 1)) * 100);

        const projects = Array.from(
          new Set(
            activeTasks
              .filter((t) => t.manager === member.name || t.support.includes(member.name))
              .map((t) => t.project)
          )
        );
        const coordinatorProjects = projectsData
          .filter((p) => p.active && p.coordinator === member.name)
          .map((p) => p.name);
        const constructionProjects = projectsData
          .filter((p) => p.active && secondaryCoordinatorByProject[p.id] === member.name)
          .map((p) => p.name);

        return {
          ...member,
          assigned,
          support,
          total,
          projects,
          coordinatorProjects,
          coordinatorProjectsCount: coordinatorProjects.length,
          constructionProjects,
          constructionProjectsCount: constructionProjects.length,
          occupancy,
          loadLabel: loadLabel(occupancy, member.active),
        };
      }),
    [members, activeTasks, projectsData, secondaryCoordinatorByProject]
  );

  const profileMember = withWorkload.find((m) => m.id === profileMemberId) ?? null;

  const visible = useMemo(
    () => withWorkload.filter((m) => (view === "activos" ? m.active : !m.active)),
    [withWorkload, view]
  );

  const kpis = useMemo(() => {
    const active = withWorkload.filter((m) => m.active);
    return {
      activos: active.length,
      desactivados: withWorkload.length - active.length,
      saturados: active.filter((m) => m.occupancy >= 100).length,
      disponibles: active.filter((m) => m.occupancy < 100).length,
    };
  }, [withWorkload]);

  const columns = useMemo<ColumnDef<(typeof withWorkload)[number], unknown>[]>(
    () => [
      createSelectionColumn<(typeof withWorkload)[number]>({
        getId: (m) => m.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
      {
        id: "member",
        header: "Colaborador",
        cell: ({ row }) => (
          <PersonAvatar name={row.original.name} subtitle={row.original.institutionalEmail} />
        ),
      },
      { accessorKey: "role", header: "Puesto" },
      { accessorKey: "area", header: "Área" },
      {
        id: "load",
        header: "Carga",
        cell: ({ row }) => (
          <div className="w-[120px]">
            <Progress value={Math.min(row.original.occupancy, 100)} className="h-2" />
          </div>
        ),
      },
      {
        accessorKey: "availability",
        header: "Disponibilidad",
        cell: ({ row }) => (
          <Badge variant={AVAILABILITY_VARIANT[row.original.availability] ?? "outline"}>
            {row.original.availability}
          </Badge>
        ),
      },
      createRowActionsColumn<(typeof withWorkload)[number]>(() => [
        { label: "Ver ficha", onSelect: (m) => setProfileMemberId(m.id) },
        { label: "Editar", onSelect: (m) => openEditEditor(m) },
        { label: "Ver proyectos como encargado", onSelect: (m) => setCoordinatorMemberId(m.id) },
        {
          label: "Copiar correo institucional",
          separatorBefore: true,
          onSelect: (m) => {
            void navigator.clipboard.writeText(m.institutionalEmail);
          },
        },
      ]),
    ],
    [selected, openEditEditor]
  );

  function bulkCopyEmails() {
    const emails = withWorkload
      .filter((m) => selected.has(m.id))
      .map((m) => m.institutionalEmail)
      .join(", ");
    void navigator.clipboard.writeText(emails);
  }

  const coordinatorMember = withWorkload.find((m) => m.id === coordinatorMemberId) ?? null;

  const exportColumns = useMemo<ExportColumn<(typeof withWorkload)[number]>[]>(
    () => [
      { key: "name", header: "Colaborador", getValue: (m) => m.name },
      { key: "role", header: "Puesto", getValue: (m) => m.role },
      { key: "area", header: "Área", getValue: (m) => m.area },
      { key: "occupancy", header: "Ocupación", getValue: (m) => `${m.occupancy}%` },
      { key: "availability", header: "Disponibilidad", getValue: (m) => m.availability },
      { key: "status", header: "Estado", getValue: (m) => (m.active ? "Activo" : "Desactivado") },
    ],
    []
  );

  async function exportTeam(format: "xlsx" | "pdf") {
    const { settings } = loadGeneralSettings();
    await exportTableData({
      moduleName: "Equipo",
      fileName: `equipo-${view}-${Date.now()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: exportColumns,
      rows: visible,
      landscape: true,
    });
  }

  return (
    <div>
      <PageHeader
        title="Equipo"
        description="Avatares, capacidad y carga actual de colaboradores."
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
                <TabsTrigger value="desactivados">Desactivados</TabsTrigger>
              </TabsList>
            </Tabs>
            <ExportMenu onExport={exportTeam} />
            <Button onClick={openAddEditor}>+ Agregar colaborador</Button>
          </>
        }
      />

      <KpiRow
        tiles={[
          { label: "Activos", value: kpis.activos },
          { label: "Desactivados", value: kpis.desactivados },
          { label: "Saturados", value: kpis.saturados, tone: kpis.saturados > 0 ? "warn" : "default" },
          { label: "Disponibles", value: kpis.disponibles, tone: "ok" },
        ]}
      />

      <BulkActionBar
        selectedCount={selected.size}
        itemLabel="colaboradores"
        actions={[{ label: "Copiar correos", onClick: bulkCopyEmails }]}
      />
      <DataTable
        columns={columns}
        data={visible}
        getRowId={(row) => String(row.id)}
        onRowClick={(row) => setProfileMemberId(row.id)}
        wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
        emptyMessage={view === "activos" ? "No hay colaboradores activos." : "No hay colaboradores desactivados."}
      />

      {profileMember ? (
        <MemberProfileModal member={profileMember} onClose={() => setProfileMemberId(null)} />
      ) : null}

      {coordinatorMember ? (
        <CoordinatorProjectsModal
          member={coordinatorMember}
          onClose={() => setCoordinatorMemberId(null)}
        />
      ) : null}

      <MemberEditorDrawer
        show={showEditor}
        onClose={closeEditor}
        editingId={editingId}
        draft={draft}
        onChangeDraft={setDraft}
        formError={formError}
        onSave={saveMember}
        accessPreviewState={accessPreviewState}
        isEditingSelfProtectedAdmin={isEditingSelfProtectedAdmin}
        teamCapabilities={teamCapabilities}
        availabilityOptions={AVAILABILITY_OPTIONS}
      />
    </div>
  );
}
