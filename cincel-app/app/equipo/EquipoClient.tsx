"use client";

import { useEffect, useMemo, useState } from "react";
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
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { fetchAreasAction } from "@/lib/actions/areas-actions";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { useMemberEditor } from "@/lib/equipo/use-member-editor";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { canExportStaff, exportStaffAction } from "@/lib/equipo/staff-export";
import type { TeamMemberWithWorkload } from "@/lib/equipo/types";
import type { Area, Staff } from "@/lib/types/core";

const AVAILABILITY_OPTIONS = [
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

interface EquipoClientProps {
  initialTeam: Staff[];
}

const AVAILABILITY_VARIANT: Record<string, "success" | "secondary" | "outline"> = {
  Disponible: "success",
  Mixto: "secondary",
};

export function EquipoClient({ initialTeam }: EquipoClientProps) {
  const [staff, setStaff] = useState<Staff[]>(initialTeam);
  const [areaOptions, setAreaOptions] = useState<Area[]>([]);
  const [areaNamesByStaffId, setAreaNamesByStaffId] = useState<Record<string, string[]>>({});
  const [taskLoad, setTaskLoad] = useState<
    Record<string, { assigned: number; support: number; projects: Set<string> }>
  >({});
  const [coordinatorProjectsByStaffId, setCoordinatorProjectsByStaffId] = useState<Record<string, string[]>>({});
  const [view, setView] = useState<"activos" | "desactivados">("activos");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const [coordinatorMemberId, setCoordinatorMemberId] = useState<string | null>(null);
  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());

  async function refresh() {
    const [staffRows, areaRows, taskRows, projectRows] = await Promise.all([
      fetchStaffAction({ includeInactive: true }),
      fetchAreasAction(),
      fetchTasksAction({ archived: false }),
      fetchProjectsAction(),
    ]);
    setStaff(staffRows);
    setAreaOptions(areaRows);

    const areaMap: Record<string, string[]> = {};
    for (const area of areaRows) {
      for (const member of area.members) (areaMap[member.staffId] ??= []).push(area.name);
    }
    setAreaNamesByStaffId(areaMap);

    const load: Record<string, { assigned: number; support: number; projects: Set<string> }> = {};
    const ensure = (id: string) => (load[id] ??= { assigned: 0, support: 0, projects: new Set() });
    for (const task of taskRows) {
      if (task.manager) {
        ensure(task.manager.id).assigned += 1;
        ensure(task.manager.id).projects.add(task.project.name);
      }
      for (const s of task.support) {
        ensure(s.id).support += 1;
        ensure(s.id).projects.add(task.project.name);
      }
    }
    setTaskLoad(load);

    const coordinatorMap: Record<string, string[]> = {};
    for (const project of projectRows) {
      if (project.status !== "activo" || !project.coordinator) continue;
      (coordinatorMap[project.coordinator.id] ??= []).push(project.name);
    }
    setCoordinatorProjectsByStaffId(coordinatorMap);
  }

  useEffect(() => {
    // Sync the roster/workload with the server on mount — refresh() is also
    // reused by the editor drawer's save handlers, so it can't be inlined
    // here without duplicating the fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

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
  } = useMemberEditor({ authenticatedUser, onSaved: refresh });

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

  const withWorkload = useMemo<TeamMemberWithWorkload[]>(
    () =>
      staff.map((member) => {
        const load = taskLoad[member.id] ?? { assigned: 0, support: 0, projects: new Set<string>() };
        const total = load.assigned + load.support;
        const occupancy = Math.round((total / Math.max(member.capacity, 1)) * 100);
        const coordinatorProjects = coordinatorProjectsByStaffId[member.id] ?? [];

        return {
          ...member,
          institutionalEmail: member.email ?? "",
          areas: areaNamesByStaffId[member.id] ?? [],
          assigned: load.assigned,
          support: load.support,
          total,
          projects: Array.from(load.projects),
          coordinatorProjects,
          coordinatorProjectsCount: coordinatorProjects.length,
          occupancy,
          loadLabel: loadLabel(occupancy, member.active),
        };
      }),
    [staff, taskLoad, coordinatorProjectsByStaffId, areaNamesByStaffId]
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

  const columns = useMemo<ColumnDef<TeamMemberWithWorkload, unknown>[]>(
    () => [
      createSelectionColumn<TeamMemberWithWorkload>({
        getId: (m) => m.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
      {
        id: "member",
        header: "Colaborador",
        cell: ({ row }) => (
          <PersonAvatar
            name={[row.original.name, row.original.lastName].filter(Boolean).join(" ")}
            subtitle={row.original.institutionalEmail}
          />
        ),
      },
      { accessorKey: "role", header: "Puesto" },
      {
        id: "areas",
        header: "Área",
        cell: ({ row }) =>
          row.original.areas.length > 0 ? (
            <span className="text-sm text-foreground">{row.original.areas.join(", ")}</span>
          ) : (
            <span className="text-sm text-muted-foreground">Sin área</span>
          ),
      },
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
          <Badge variant={AVAILABILITY_VARIANT[row.original.availability ?? ""] ?? "outline"}>
            {row.original.availability || "Sin definir"}
          </Badge>
        ),
      },
      createRowActionsColumn<TeamMemberWithWorkload>(() => [
        { label: "Ver ficha", onSelect: (m) => setProfileMemberId(m.id) },
        { label: "Editar", onSelect: (m) => void openEditEditor(m) },
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

  async function exportTeam(format: "xlsx" | "pdf") {
    const { settings } = loadGeneralSettings();
    await exportStaffAction(visible, format, {
      user: authenticatedUser,
      companyName: settings.company.tradeName || settings.company.legalName,
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
            {canExportStaff(authenticatedUser) ? <ExportMenu onExport={exportTeam} /> : null}
            {teamCapabilities.canCreateCollaborator ? (
              <Button onClick={openAddEditor}>+ Agregar colaborador</Button>
            ) : null}
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
        getRowId={(row) => row.id}
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
        onSave={() => void saveMember()}
        accessPreviewState={accessPreviewState}
        isEditingSelfProtectedAdmin={isEditingSelfProtectedAdmin}
        teamCapabilities={teamCapabilities}
        availabilityOptions={AVAILABILITY_OPTIONS}
        areaOptions={areaOptions}
      />
    </div>
  );
}
