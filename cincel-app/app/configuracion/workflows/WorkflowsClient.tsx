"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import {
  emptyTemplateDraft,
  WorkflowTemplateDrawer,
  type TemplateDraft,
} from "@/components/configuracion/WorkflowTemplateDrawer";
import {
  createTemplateAction,
  deactivateTemplateAction,
  fetchWorkflowsAction,
  reorderTemplatesAction,
  updateTemplateAction,
} from "@/lib/actions/workflows-actions";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveWorkflowsCapabilities } from "@/lib/auth/permissions";
import type {
  WorkflowDetail,
  WorkflowTaskTemplate,
  WorkflowTaskTemplateInput,
} from "@/lib/types/core";

const PRIORITY_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

function toDraft(template: WorkflowTaskTemplate): TemplateDraft {
  return {
    title: template.title,
    phase: template.phase ?? "",
    notes: template.notes ?? "",
    defaultPriority: template.defaultPriority,
    commitmentOffsetDays:
      template.commitmentOffsetDays === null
        ? ""
        : String(template.commitmentOffsetDays),
    reviewOffsetDays:
      template.reviewOffsetDays === null
        ? ""
        : String(template.reviewOffsetDays),
    deliveryOffsetDays:
      template.deliveryOffsetDays === null
        ? ""
        : String(template.deliveryOffsetDays),
    active: template.active,
  };
}

function toInput(draft: TemplateDraft): WorkflowTaskTemplateInput {
  const toOffset = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  };

  return {
    title: draft.title.trim(),
    phase: draft.phase.trim() || null,
    notes: draft.notes.trim() || null,
    defaultPriority: draft.defaultPriority,
    commitmentOffsetDays: toOffset(draft.commitmentOffsetDays),
    reviewOffsetDays: toOffset(draft.reviewOffsetDays),
    deliveryOffsetDays: toOffset(draft.deliveryOffsetDays),
    active: draft.active,
  };
}

interface WorkflowsClientProps {
  initialWorkflows: WorkflowDetail[];
}

export function WorkflowsClient({ initialWorkflows }: WorkflowsClientProps) {
  const [workflows, setWorkflows] =
    useState<WorkflowDetail[]>(initialWorkflows);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    initialWorkflows[0]?.id ?? null,
  );
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(emptyTemplateDraft);
  const [formError, setFormError] = useState("");
  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());

  const capabilities = useMemo(
    () => resolveWorkflowsCapabilities(authenticatedUser),
    [authenticatedUser],
  );

  const selectedWorkflow = useMemo(
    () =>
      workflows.find((w) => w.id === selectedWorkflowId) ??
      workflows[0] ??
      null,
    [workflows, selectedWorkflowId],
  );

  const templates = useMemo(
    () =>
      [...(selectedWorkflow?.templates ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
    [selectedWorkflow],
  );

  async function refresh() {
    const rows = await fetchWorkflowsAction({
      includeInactive: true,
      includeInactiveTemplates: true,
    });
    setWorkflows(rows);
  }

  function openAddEditor() {
    setEditingId(null);
    setDraft(emptyTemplateDraft);
    setFormError("");
    setShowEditor(true);
  }

  function openEditEditor(template: WorkflowTaskTemplate) {
    setEditingId(template.id);
    setDraft(toDraft(template));
    setFormError("");
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
  }

  async function saveTemplate() {
    if (!selectedWorkflow) return;
    if (!draft.title.trim()) {
      setFormError("El título es obligatorio.");
      return;
    }

    try {
      const input = toInput(draft);
      if (editingId === null) {
        await createTemplateAction(selectedWorkflow.id, input);
      } else {
        await updateTemplateAction(editingId, input);
      }
      await refresh();
      setShowEditor(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar la plantilla.",
      );
    }
  }

  async function deactivateTemplate(template: WorkflowTaskTemplate) {
    if (
      !window.confirm(
        `¿Desactivar la plantilla "${template.title}"? Seguirá visible en el historial.`,
      )
    )
      return;
    await deactivateTemplateAction(template.id);
    await refresh();
  }

  async function moveTemplate(
    template: WorkflowTaskTemplate,
    direction: "up" | "down",
  ) {
    if (!selectedWorkflow) return;
    const index = templates.findIndex((t) => t.id === template.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= templates.length) return;

    const reordered = [...templates];
    [reordered[index], reordered[swapWith]] = [
      reordered[swapWith],
      reordered[index],
    ];
    await reorderTemplatesAction(
      selectedWorkflow.id,
      reordered.map((t) => t.id),
    );
    await refresh();
  }

  const columns = useMemo<ColumnDef<WorkflowTaskTemplate, unknown>[]>(
    () => [
      {
        id: "orden",
        header: "#",
        size: 40,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.index + 1}</span>
        ),
      },
      { accessorKey: "title", header: "Título" },
      {
        id: "phase",
        header: "Fase",
        cell: ({ row }) =>
          row.original.phase || (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "priority",
        header: "Prioridad",
        cell: ({ row }) => (
          <Badge variant="outline">
            {PRIORITY_LABEL[row.original.defaultPriority] ??
              row.original.defaultPriority}
          </Badge>
        ),
      },
      {
        id: "active",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={row.original.active ? "success" : "outline"}>
            {row.original.active ? "Activa" : "Inactiva"}
          </Badge>
        ),
      },
      ...(capabilities.canManageWorkflows
        ? [
            createRowActionsColumn<WorkflowTaskTemplate>((template) => {
              const index = templates.findIndex((t) => t.id === template.id);
              const actions: Array<{
                label: string;
                onSelect: (t: WorkflowTaskTemplate) => void;
                variant?: "default" | "destructive";
                separatorBefore?: boolean;
              }> = [{ label: "Editar", onSelect: (t) => openEditEditor(t) }];

              if (index > 0) {
                actions.push({
                  label: "Mover arriba",
                  onSelect: (t) => void moveTemplate(t, "up"),
                });
              }
              if (index >= 0 && index < templates.length - 1) {
                actions.push({
                  label: "Mover abajo",
                  onSelect: (t) => void moveTemplate(t, "down"),
                });
              }
              if (template.active) {
                actions.push({
                  label: "Desactivar",
                  onSelect: (t) => void deactivateTemplate(t),
                  variant: "destructive",
                  separatorBefore: true,
                });
              }

              return actions;
            }),
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capabilities.canManageWorkflows, templates],
  );

  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Plantillas de tareas por workflow — Presale, Diseño y Construcción."
      />

      <div className="space-y-6">
        {!capabilities.canViewWorkflows ? (
          <section className="rounded-2xl border border-border bg-card p-8 shadow-sm text-sm text-muted-foreground">
            No tienes permiso para ver los workflows.
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs
                  value={selectedWorkflow?.id ?? undefined}
                  onValueChange={(value) => setSelectedWorkflowId(value)}
                >
                  <TabsList>
                    {workflows.map((workflow) => (
                      <TabsTrigger key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                {capabilities.canManageWorkflows ? (
                  <Button onClick={openAddEditor} disabled={!selectedWorkflow}>
                    + Nueva plantilla
                  </Button>
                ) : null}
              </div>

              {selectedWorkflow?.description ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {selectedWorkflow.description}
                </p>
              ) : null}
            </section>

            <DataTable
              columns={columns}
              data={templates}
              getRowId={(row) => row.id}
              emptyMessage="Este workflow todavía no tiene plantillas de tareas."
            />
          </>
        )}
      </div>

      <WorkflowTemplateDrawer
        show={showEditor}
        onClose={closeEditor}
        editingId={editingId}
        workflowName={selectedWorkflow?.name ?? ""}
        draft={draft}
        onChangeDraft={setDraft}
        formError={formError}
        onSave={() => void saveTemplate()}
        canSave={capabilities.canManageWorkflows}
      />
    </div>
  );
}
