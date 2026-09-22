"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import {
  AreaEditorDrawer,
  type AreaDraft,
} from "@/components/configuracion/AreaEditorDrawer";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveAreasCapabilities } from "@/lib/auth/permissions";
import {
  createAreaAction,
  deleteAreaAction,
  fetchAreaAction,
  fetchAreasAction,
  setAreaMembersAction,
  setAreaWorkflowsAction,
  updateAreaAction,
} from "@/lib/actions/areas-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import type { AreaDetail, Staff, WorkflowDetail } from "@/lib/types/core";

const EMPTY_DRAFT: AreaDraft = {
  name: "",
  description: "",
  leadId: null,
  active: true,
};

function draftFromArea(area: AreaDetail): AreaDraft {
  return {
    name: area.name,
    description: area.description ?? "",
    leadId: area.leadId,
    active: area.active,
  };
}

interface AreasClientProps {
  initialAreas: AreaDetail[];
}

export function AreasClient({ initialAreas }: AreasClientProps) {
  const [areas, setAreas] = useState<AreaDetail[]>(initialAreas);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDetail[]>([]);
  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const capabilities = useMemo(
    () => resolveAreasCapabilities(authenticatedUser),
    [authenticatedUser],
  );

  const [showEditor, setShowEditor] = useState(false);
  const [editingArea, setEditingArea] = useState<AreaDetail | null>(null);
  const [draft, setDraft] = useState<AreaDraft>(EMPTY_DRAFT);
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const [workflowNames, setWorkflowNames] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function refresh() {
    const [areaRows, staffRows, workflowRows] = await Promise.all([
      fetchAreasAction({ includeInactive: true }),
      fetchStaffAction({ includeInactive: true }),
      fetchWorkflowsAction(),
    ]);
    setAreas(areaRows);
    setStaff(staffRows);
    setWorkflows(workflowRows);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  const staffOptions = useMemo(
    () =>
      staff
        .filter((member) => member.active)
        .map((member) => ({ id: member.id, name: member.name })),
    [staff],
  );
  const staffNameToId = useMemo(
    () => new Map(staffOptions.map((option) => [option.name, option.id])),
    [staffOptions],
  );

  const workflowOptions = useMemo(
    () =>
      workflows
        .filter((workflow) => workflow.active)
        .map((workflow) => ({ id: workflow.id, name: workflow.name })),
    [workflows],
  );
  const workflowNameToId = useMemo(
    () => new Map(workflowOptions.map((option) => [option.name, option.id])),
    [workflowOptions],
  );

  function openAddEditor() {
    setEditingArea(null);
    setDraft(EMPTY_DRAFT);
    setMemberNames([]);
    setWorkflowNames([]);
    setFormError("");
    setShowEditor(true);
  }

  function openEditEditor(area: AreaDetail) {
    setEditingArea(area);
    setDraft(draftFromArea(area));
    setMemberNames(area.members.map((member) => member.name));
    setWorkflowNames(area.workflows.map((workflow) => workflow.name));
    setFormError("");
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditingArea(null);
  }

  async function saveBasic() {
    const name = draft.name.trim();
    if (!name) {
      setFormError("El nombre del área es obligatorio.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const input = {
        name,
        description: draft.description.trim() || null,
        leadId: draft.leadId,
        active: draft.active,
      };

      if (editingArea === null) {
        const created = await createAreaAction(input);
        const detail = await fetchAreaAction(created.id);
        if (detail) {
          setEditingArea(detail);
          setMemberNames(detail.members.map((member) => member.name));
          setWorkflowNames(detail.workflows.map((workflow) => workflow.name));
        }
      } else {
        await updateAreaAction(editingArea.id, input);
        const detail = await fetchAreaAction(editingArea.id);
        if (detail) setEditingArea(detail);
      }

      await refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "No se pudo guardar el área.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveMembers() {
    if (!editingArea) return;

    setFormError("");
    try {
      const staffIds = memberNames
        .map((name) => staffNameToId.get(name))
        .filter((id): id is string => Boolean(id));
      await setAreaMembersAction(
        editingArea.id,
        staffIds.map((staffId) => ({ staffId })),
      );
      const detail = await fetchAreaAction(editingArea.id);
      if (detail) {
        setEditingArea(detail);
        setMemberNames(detail.members.map((member) => member.name));
      }
      await refresh();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los miembros.",
      );
    }
  }

  async function saveWorkflows() {
    if (!editingArea) return;

    setFormError("");
    try {
      const workflowIds = workflowNames
        .map((name) => workflowNameToId.get(name))
        .filter((id): id is string => Boolean(id));
      await setAreaWorkflowsAction(editingArea.id, workflowIds);
      const detail = await fetchAreaAction(editingArea.id);
      if (detail) {
        setEditingArea(detail);
        setWorkflowNames(detail.workflows.map((workflow) => workflow.name));
      }
      await refresh();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los workflows.",
      );
    }
  }

  async function toggleActive(area: AreaDetail) {
    if (area.active) {
      if (!window.confirm(`¿Desactivar el área "${area.name}"?`)) return;
      await deleteAreaAction(area.id);
    } else {
      await updateAreaAction(area.id, { active: true });
    }
    await refresh();
  }

  const columns = useMemo<ColumnDef<AreaDetail, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Área",
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-foreground">{row.original.name}</p>
            {row.original.description ? (
              <p className="text-xs text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "lead",
        header: "Responsable",
        cell: ({ row }) => (
          <span className="text-sm text-foreground">
            {row.original.lead?.name ?? "Sin responsable"}
          </span>
        ),
      },
      {
        id: "members",
        header: "Miembros",
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.members.length}</Badge>
        ),
      },
      {
        id: "workflows",
        header: "Workflows",
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.workflows.length}</Badge>
        ),
      },
      {
        id: "status",
        header: "Estado",
        cell: ({ row }) =>
          row.original.active ? (
            <Badge variant="success">Activa</Badge>
          ) : (
            <Badge variant="secondary">Inactiva</Badge>
          ),
      },
      createRowActionsColumn<AreaDetail>((area) => [
        { label: "Editar", onSelect: (a) => openEditEditor(a) },
        {
          label: area.active ? "Desactivar" : "Activar",
          separatorBefore: true,
          variant: area.active ? "destructive" : "default",
          onSelect: (a) => void toggleActive(a),
        },
      ]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Áreas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Departamentos internos, sus responsables, miembros y workflows
              asignados.
            </p>
          </div>
          {capabilities.canManageAreas ? (
            <Button onClick={openAddEditor}>+ Nueva área</Button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <DataTable
          columns={columns}
          data={areas}
          getRowId={(row) => row.id}
          onRowClick={(row) => openEditEditor(row)}
          emptyMessage="No hay áreas registradas."
        />
      </section>

      <AreaEditorDrawer
        show={showEditor}
        onClose={closeEditor}
        editingArea={editingArea}
        draft={draft}
        onChangeDraft={setDraft}
        formError={formError}
        onSaveBasic={() => void saveBasic()}
        isSaving={isSaving}
        staffOptions={staffOptions}
        workflowOptions={workflowOptions}
        memberNames={memberNames}
        onChangeMemberNames={setMemberNames}
        onSaveMembers={() => void saveMembers()}
        workflowNames={workflowNames}
        onChangeWorkflowNames={setWorkflowNames}
        onSaveWorkflows={() => void saveWorkflows()}
        capabilities={capabilities}
      />
    </div>
  );
}
