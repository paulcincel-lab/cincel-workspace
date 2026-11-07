"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Switch } from "@/components/ui/shadcn/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { PhaseEditorDrawer } from "@/components/configuracion/PhaseEditorDrawer";
import {
  emptyTemplateDraft,
  TemplateTaskDrawer,
  type TemplateDraft,
} from "@/components/configuracion/TemplateTaskDrawer";
import {
  createTemplateAction,
  deactivateTemplateAction,
  fetchWorkflowsAction,
  reorderTemplatesAction,
  reorderWorkflowPhasesAction,
  setWorkflowAutoStartAction,
  updateTemplateAction,
  updateWorkflowPhaseAction,
} from "@/lib/actions/workflows-actions";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveWorkflowsCapabilities } from "@/lib/auth/permissions";
import { tramosErrorText } from "@/lib/tramos/tramos-error-text";
import type {
  WorkflowDetail,
  WorkflowPhase,
  WorkflowPhaseRef,
  WorkflowTaskTemplate,
  WorkflowTaskTemplateInput,
} from "@/lib/types/core";

const PRIORITY_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

const FETCH_OPTIONS = {
  includeInactive: true,
  includeInactiveTemplates: true,
  includeInactivePhases: true,
} as const;

function toDraft(template: WorkflowTaskTemplate): TemplateDraft {
  const offset = (value: number | null) => (value === null ? "" : String(value));
  return {
    title: template.title,
    phaseId: template.phaseId ?? "",
    notes: template.notes ?? "",
    defaultPriority: template.defaultPriority,
    commitmentOffsetDays: offset(template.commitmentOffsetDays),
    reviewOffsetDays: offset(template.reviewOffsetDays),
    deliveryOffsetDays: offset(template.deliveryOffsetDays),
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
    phaseId: draft.phaseId,
    notes: draft.notes.trim() || null,
    defaultPriority: draft.defaultPriority,
    commitmentOffsetDays: toOffset(draft.commitmentOffsetDays),
    reviewOffsetDays: toOffset(draft.reviewOffsetDays),
    deliveryOffsetDays: toOffset(draft.deliveryOffsetDays),
    active: draft.active,
  };
}

/** Helper text under "Iniciar automáticamente" (readiness is fixed in code, read-only here). */
export function autoStartHelpText(workflow: WorkflowDetail, isFirst: boolean): string {
  if (isFirst || workflow.readiness === null) return "Se inicia al crear un proyecto.";
  const { afterPhase, afterWorkflow } = workflow.readiness;
  return `Se inicia solo cuando el proyecto está listo (${afterPhase.name} de ${afterWorkflow.name} completada). Si está apagado, el proyecto aparece en «Listos para iniciar».`;
}

/** Templates grouped by fase order, then by their own order. */
export function sortTemplatesByPhase(
  templates: WorkflowTaskTemplate[],
  phases: WorkflowPhaseRef[],
): WorkflowTaskTemplate[] {
  const phaseOrder = new Map(phases.map((p) => [p.id, p.sortOrder]));
  const rank = (t: WorkflowTaskTemplate) => phaseOrder.get(t.phaseId) ?? Number.MAX_SAFE_INTEGER;
  return [...templates].sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder);
}

interface TramosClientProps {
  initialWorkflows: WorkflowDetail[];
}

export function TramosClient({ initialWorkflows }: TramosClientProps) {
  const [workflows, setWorkflows] = useState<WorkflowDetail[]>(initialWorkflows);
  // The first tramo in flow order starts selected.
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    () => [...initialWorkflows].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id ?? null,
  );
  const [pageError, setPageError] = useState("");

  const [phaseEditorOpen, setPhaseEditorOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<WorkflowPhase | null>(null);

  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(emptyTemplateDraft);
  const [formError, setFormError] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingAutoStart, setSavingAutoStart] = useState(false);

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const capabilities = useMemo(
    () => resolveWorkflowsCapabilities(authenticatedUser),
    [authenticatedUser],
  );
  const canManage = capabilities.canManageWorkflows;

  const sortedWorkflows = useMemo(
    () => [...workflows].sort((a, b) => a.sortOrder - b.sortOrder),
    [workflows],
  );

  const selectedWorkflow = useMemo(
    () => sortedWorkflows.find((w) => w.id === selectedWorkflowId) ?? sortedWorkflows[0] ?? null,
    [sortedWorkflows, selectedWorkflowId],
  );
  const isFirstTramo = selectedWorkflow !== null && sortedWorkflows[0]?.id === selectedWorkflow.id;

  const phases = useMemo(
    () => [...(selectedWorkflow?.phases ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [selectedWorkflow],
  );

  const templates = useMemo(
    () => sortTemplatesByPhase(selectedWorkflow?.templates ?? [], phases),
    [selectedWorkflow, phases],
  );

  /** Active fases for the drawer select; keeps the edited template's own fase if it was deactivated. */
  const drawerPhases = useMemo<WorkflowPhaseRef[]>(() => {
    return phases.filter((p) => p.active || p.id === draft.phaseId);
  }, [phases, draft.phaseId]);

  async function refresh() {
    try {
      setWorkflows(await fetchWorkflowsAction(FETCH_OPTIONS));
    } catch (err) {
      setPageError(tramosErrorText(err));
    }
  }

  async function runPageAction(action: () => Promise<unknown>) {
    setPageError("");
    try {
      await action();
    } catch (err) {
      setPageError(tramosErrorText(err));
    }
    await refresh();
  }

  // ── Inicio ──────────────────────────────────────────────────────────────
  async function toggleAutoStart(next: boolean) {
    if (!selectedWorkflow) return;
    const workflowId = selectedWorkflow.id;
    setSavingAutoStart(true);
    await runPageAction(() => setWorkflowAutoStartAction(workflowId, next));
    setSavingAutoStart(false);
  }

  // ── Fases ───────────────────────────────────────────────────────────────
  function openNewPhase() {
    setEditingPhase(null);
    setPhaseEditorOpen(true);
  }

  function openEditPhase(phase: WorkflowPhase) {
    setEditingPhase(phase);
    setPhaseEditorOpen(true);
  }

  async function onPhaseSaved() {
    setPhaseEditorOpen(false);
    await refresh();
  }

  function setPhaseActive(phase: WorkflowPhase, active: boolean) {
    void runPageAction(() => updateWorkflowPhaseAction(phase.id, { active }));
  }

  function reorderPhases(orderedIds: string[]) {
    if (!selectedWorkflow) return;
    const workflowId = selectedWorkflow.id;
    void runPageAction(() => reorderWorkflowPhasesAction(workflowId, orderedIds));
  }

  // ── Tareas de plantilla ─────────────────────────────────────────────────
  function openNewTemplate() {
    setEditingTemplateId(null);
    setDraft(emptyTemplateDraft);
    setFormError("");
    setShowTemplateEditor(true);
  }

  function openEditTemplate(template: WorkflowTaskTemplate) {
    setEditingTemplateId(template.id);
    setDraft(toDraft(template));
    setFormError("");
    setShowTemplateEditor(true);
  }

  async function saveTemplate() {
    if (!selectedWorkflow) return;
    if (!draft.title.trim()) {
      setFormError("Escribe un nombre.");
      return;
    }
    if (!draft.phaseId) {
      setFormError("Elige una fase.");
      return;
    }

    const phaseName = phases.find((p) => p.id === draft.phaseId)?.name ?? "";
    setSavingTemplate(true);
    setFormError("");
    try {
      const input = toInput(draft);
      if (editingTemplateId === null) {
        await createTemplateAction(selectedWorkflow.id, input);
      } else {
        await updateTemplateAction(editingTemplateId, input);
      }
      setShowTemplateEditor(false);
      await refresh();
    } catch (err) {
      setFormError(tramosErrorText(err, { kind: "template", phaseName }));
    } finally {
      setSavingTemplate(false);
    }
  }

  function deactivateTemplate(template: WorkflowTaskTemplate) {
    if (
      !window.confirm(
        `¿Desactivar la tarea de plantilla "${template.title}"? Seguirá visible en el historial.`,
      )
    )
      return;
    void runPageAction(() => deactivateTemplateAction(template.id));
  }

  function moveTemplate(template: WorkflowTaskTemplate, direction: "up" | "down") {
    if (!selectedWorkflow) return;
    const index = templates.findIndex((t) => t.id === template.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= templates.length) return;
    if (templates[swapWith].phaseId !== template.phaseId) return;

    const reordered = [...templates];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    const workflowId = selectedWorkflow.id;
    void runPageAction(() => reorderTemplatesAction(workflowId, reordered.map((t) => t.id)));
  }

  const phaseColumns = useMemo<ColumnDef<WorkflowPhase, unknown>[]>(
    () => [
      {
        id: "orden",
        header: "Orden",
        size: 60,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.index + 1}</span>,
      },
      { accessorKey: "name", header: "Fase" },
      {
        id: "templateCount",
        header: "Tareas de plantilla",
        cell: ({ row }) => row.original.templateCount,
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
      ...(canManage
        ? [
            createRowActionsColumn<WorkflowPhase>((phase) => [
              { label: "Editar", onSelect: (p) => openEditPhase(p) },
              phase.active
                ? {
                    label: "Desactivar",
                    onSelect: (p) => setPhaseActive(p, false),
                    variant: "destructive",
                    separatorBefore: true,
                  }
                : { label: "Activar", onSelect: (p) => setPhaseActive(p, true), separatorBefore: true },
            ]),
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, selectedWorkflow?.id],
  );

  const templateColumns = useMemo<ColumnDef<WorkflowTaskTemplate, unknown>[]>(
    () => [
      {
        id: "orden",
        header: "#",
        size: 40,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.index + 1}</span>,
      },
      { accessorKey: "title", header: "Tarea" },
      {
        id: "phase",
        header: "Fase",
        cell: ({ row }) =>
          row.original.phaseName || <span className="text-muted-foreground">—</span>,
      },
      {
        id: "priority",
        header: "Prioridad",
        cell: ({ row }) => (
          <Badge variant="outline">
            {PRIORITY_LABEL[row.original.defaultPriority] ?? row.original.defaultPriority}
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
      ...(canManage
        ? [
            createRowActionsColumn<WorkflowTaskTemplate>((template) => {
              const index = templates.findIndex((t) => t.id === template.id);
              const actions: RowAction<WorkflowTaskTemplate>[] = [
                { label: "Editar", onSelect: (t) => openEditTemplate(t) },
              ];
              if (index > 0 && templates[index - 1].phaseId === template.phaseId) {
                actions.push({ label: "Mover arriba", onSelect: (t) => moveTemplate(t, "up") });
              }
              if (index >= 0 && index < templates.length - 1 && templates[index + 1].phaseId === template.phaseId) {
                actions.push({ label: "Mover abajo", onSelect: (t) => moveTemplate(t, "down") });
              }
              if (template.active) {
                actions.push({
                  label: "Desactivar",
                  onSelect: (t) => deactivateTemplate(t),
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
    [canManage, templates],
  );

  const autoStartOn = selectedWorkflow ? selectedWorkflow.autoStart !== "manual" : false;

  return (
    <div>
      <PageHeader
        title="Tramos y fases"
        description="Fases, tareas de plantilla e inicio automático de cada tramo."
      />

      <div className="space-y-6">
        {pageError ? (
          <Alert variant="destructive">
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        ) : null}

        {!capabilities.canViewWorkflows ? (
          <section className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground shadow-sm">
            No tienes permiso para ver los tramos.
          </section>
        ) : sortedWorkflows.length === 0 ? (
          <section className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground shadow-sm">
            <p className="font-medium text-foreground">Todavía no hay tramos.</p>
            <p className="mt-2">
              Los tramos (Presale, Diseño y Construcción) se crean al desplegar la aplicación. Si esta lista sigue
              vacía, pide a soporte que vuelva a ejecutar la migración de la base de datos.
            </p>
          </section>
        ) : selectedWorkflow ? (
          <>
            <Tabs value={selectedWorkflow.id} onValueChange={(value) => setSelectedWorkflowId(value as string)}>
              <TabsList>
                {sortedWorkflows.map((workflow) => (
                  <TabsTrigger key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm" aria-labelledby="tramo-inicio">
              <h2 id="tramo-inicio" className="text-base font-semibold text-foreground">Inicio</h2>
              <label className="mt-3 flex items-start gap-3 text-sm">
                <Switch
                  checked={autoStartOn}
                  disabled={!canManage || savingAutoStart}
                  onCheckedChange={(checked) => void toggleAutoStart(Boolean(checked))}
                />
                <span>
                  Iniciar automáticamente
                  <span className="block text-muted-foreground">
                    {autoStartHelpText(selectedWorkflow, isFirstTramo)}
                  </span>
                </span>
              </label>
            </section>

            <section className="space-y-3" aria-labelledby="tramo-fases">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="tramo-fases" className="text-base font-semibold text-foreground">Fases</h2>
                {canManage ? <Button onClick={openNewPhase}>+ Nueva fase</Button> : null}
              </div>
              <DataTable
                columns={phaseColumns}
                data={phases}
                getRowId={(row) => row.id}
                onReorderRows={canManage ? reorderPhases : undefined}
                emptyMessage="Este tramo aún no tiene fases."
              />
            </section>

            <section className="space-y-3" aria-labelledby="tramo-plantillas">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="tramo-plantillas" className="text-base font-semibold text-foreground">Tareas de plantilla</h2>
                {canManage ? (
                  <Button onClick={openNewTemplate} disabled={!phases.some((p) => p.active)}>
                    + Nueva tarea de plantilla
                  </Button>
                ) : null}
              </div>
              <DataTable
                columns={templateColumns}
                data={templates}
                getRowId={(row) => row.id}
                emptyMessage="Este tramo todavía no tiene tareas de plantilla."
              />
            </section>
          </>
        ) : null}
      </div>

      {selectedWorkflow ? (
        <PhaseEditorDrawer
          open={phaseEditorOpen}
          workflow={selectedWorkflow}
          phase={editingPhase}
          onClose={() => setPhaseEditorOpen(false)}
          onSaved={() => void onPhaseSaved()}
        />
      ) : null}

      <TemplateTaskDrawer
        show={showTemplateEditor}
        onClose={() => setShowTemplateEditor(false)}
        editingId={editingTemplateId}
        workflowName={selectedWorkflow?.name ?? ""}
        phases={drawerPhases}
        draft={draft}
        onChangeDraft={setDraft}
        formError={formError}
        onSave={() => void saveTemplate()}
        canSave={canManage}
        isSaving={savingTemplate}
      />
    </div>
  );
}
