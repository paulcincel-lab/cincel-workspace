"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { CatalogEditorPanel, CatalogLayout } from "@/components/ajustes/CatalogEditorPanel";
import {
  CatalogCreateButton,
  CatalogInlineAdd,
  CatalogListHeader,
  CatalogPanelFooter,
  CatalogRowMenu,
  catalogActionTrigger,
  MonoCount,
  rowNewClass,
  useFlashedRows,
} from "@/components/ajustes/catalog-parts";
import { PhaseListEditor } from "@/components/configuracion/PhaseEditorDrawer";
import {
  emptyTemplateDraft,
  TemplateTaskDrawer,
  type TemplateDraft,
} from "@/components/configuracion/TemplateTaskDrawer";
import { DataTable } from "@/components/ui/DataTable";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import { unwrapActionResult } from "@/lib/actions/action-result";
import {
  createTemplateAction,
  createWorkflowAction,
  createWorkflowPhaseAction,
  deleteWorkflowAction,
  reorderWorkflowPhasesAction,
  reorderWorkflowsAction,
  setWorkflowAutoStartAction,
  updateTemplateAction,
  updateWorkflowAction,
  updateWorkflowPhaseAction,
} from "@/lib/actions/workflows-actions";
import { resolveWorkflowsCapabilities } from "@/lib/auth/permissions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesEtapasOptions, type AjustesEtapasPageData } from "@/lib/query/options/ajustes";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import {
  AUTO_START_INVALIDATIONS,
  PHASE_INVALIDATIONS,
  TEMPLATE_INVALIDATIONS,
  ETAPA_INVALIDATIONS,
} from "@/lib/etapas/invalidations";
import {
  ETAPA_COLOR_NAMES,
  ETAPA_COLOR_SLOTS,
  etapaColorClass,
  etapaColorSlot,
  type EtapaColorSlot,
} from "@/lib/etapas/etapa-color";
import { etapasErrorText, type EtapasErrorContext } from "@/lib/etapas/etapas-error-text";
import type {
  WorkflowDetail,
  WorkflowPhase,
  WorkflowPhaseRef,
  WorkflowTaskTemplate,
  WorkflowTaskTemplateInput,
} from "@/lib/types/core";
import { cn } from "@/lib/utils";

/** Swatch / dot background per slot. Literal strings so Tailwind picks them up. */
const COLOR_BG: Record<EtapaColorSlot, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

/** The "Nueva tarea de plantilla" option of the template picker. */
const NEW_TEMPLATE = "__new__";

const PAGE_KEY = qk.ajustes.page("etapas");

export function toDraft(template: WorkflowTaskTemplate): TemplateDraft {
  const offset = (value: number | null) => (value === null ? "" : String(value));
  return {
    title: template.title,
    phaseId: template.phaseId ?? "",
    notes: template.notes ?? "",
    defaultPriority: template.defaultPriority,
    commitmentOffsetDays: offset(template.commitmentOffsetDays),
    reviewOffsetDays: offset(template.reviewOffsetDays),
    deliveryOffsetDays: offset(template.deliveryOffsetDays),
    defaultEstimatedHours: offset(template.defaultEstimatedHours ?? null),
    active: template.active,
  };
}

export function toInput(draft: TemplateDraft): WorkflowTaskTemplateInput {
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
    defaultEstimatedHours: toOffset(draft.defaultEstimatedHours),
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

/**
 * The `workflows.key` of a new etapa: its name without accents, lowercase,
 * every run of other characters as "-"; "-2", "-3"… when `taken` has it.
 */
export function etapaKeyFor(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "etapa";
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
  return key;
}

/** "Azul" for the etapa's color slot; "Sin color" when it has none. */
function colorName(workflow: WorkflowDetail): string {
  const slot = etapaColorSlot(workflow);
  return slot ? ETAPA_COLOR_NAMES[slot] : "Sin color";
}

/** The mutation options every Etapas write shares: its invalidations, and the copy shown by the caller (`etapasErrorText`). */
function etapasMutation(invalidate: readonly (readonly unknown[])[]) {
  return { invalidate, onFormError: () => undefined } as const;
}

/** Reorders the cached etapas to `orderedIds` (sortOrder = index) and returns the previous page data for the rollback. */
export async function reorderCachedEtapas(
  qc: QueryClient,
  orderedIds: string[],
): Promise<AjustesEtapasPageData | undefined> {
  await qc.cancelQueries({ queryKey: PAGE_KEY });
  const previous = qc.getQueryData<AjustesEtapasPageData>(PAGE_KEY);
  if (previous) {
    const byId = new Map(previous.workflows.map((w) => [w.id, w]));
    const listed = orderedIds.map((id) => byId.get(id)).filter((w): w is WorkflowDetail => Boolean(w));
    const rest = previous.workflows.filter((w) => !orderedIds.includes(w.id));
    qc.setQueryData<AjustesEtapasPageData>(PAGE_KEY, {
      ...previous,
      workflows: [...listed.map((w, i) => ({ ...w, sortOrder: i })), ...rest],
    });
  }
  return previous;
}

/** Reorders one etapa's cached fases (sortOrder = index) and returns the previous page data. */
async function reorderCachedPhases(
  qc: QueryClient,
  workflowId: string,
  orderedIds: string[],
): Promise<AjustesEtapasPageData | undefined> {
  await qc.cancelQueries({ queryKey: PAGE_KEY });
  const previous = qc.getQueryData<AjustesEtapasPageData>(PAGE_KEY);
  if (previous) {
    qc.setQueryData<AjustesEtapasPageData>(PAGE_KEY, {
      ...previous,
      workflows: previous.workflows.map((w) => {
        if (w.id !== workflowId) return w;
        const byId = new Map(w.phases.map((p) => [p.id, p]));
        const phases = orderedIds
          .map((id) => byId.get(id))
          .filter((p): p is WorkflowPhase => Boolean(p))
          .map((p, i) => ({ ...p, sortOrder: i }));
        return { ...w, phases };
      }),
    });
  }
  return previous;
}

function rollback(qc: QueryClient, previous: AjustesEtapasPageData | undefined) {
  if (previous) qc.setQueryData(PAGE_KEY, previous);
}

type TemplateSaveVars = { workflowId: string; templateId: string | null; input: WorkflowTaskTemplateInput };

function saveTemplateAction({ workflowId, templateId, input }: TemplateSaveVars) {
  return templateId === null ? createTemplateAction(workflowId, input) : updateTemplateAction(templateId, input);
}

type SaveEtapaVars = {
  workflowId: string;
  /** Only the fields that changed. */
  patch: { name?: string; colorSlot?: EtapaColorSlot | null };
  renames: { phaseId: string; name: string }[];
};

/** The etapa's own fields, then each renamed fase, in sequence. */
async function saveEtapa({ workflowId, patch, renames }: SaveEtapaVars): Promise<void> {
  if (Object.keys(patch).length > 0) unwrapActionResult(await updateWorkflowAction(workflowId, patch));
  for (const rename of renames) {
    unwrapActionResult(await updateWorkflowPhaseAction(rename.phaseId, { name: rename.name }));
  }
}

/**
 * Ajustes › Etapas y fases (frame `Ajustes-Etapas`): the etapas in flow
 * order with their color, fases, templates and active projects, and the
 * editor of one etapa beside the list (`CatalogEditorPanel`). Reads
 * `qk.ajustes.page('etapas')`, hydrated by the page (no fetch on mount).
 * Reorders are optimistic with rollback; every write invalidates the keys in
 * `lib/etapas/invalidations.ts`. One layout for every presentation style.
 */
export function EtapasClient() {
  const { workflows, activeProjects = {}, phaseTaskCounts = {} } = useSuspenseQuery(ajustesEtapasOptions()).data;
  const authenticatedUser = useSessionStore(selectCurrentUser);
  const capabilities = useMemo(() => resolveWorkflowsCapabilities(authenticatedUser), [authenticatedUser]);
  const canManage = capabilities.canManageWorkflows;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WorkflowDetail | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [pageError, setPageError] = useState("");
  const { flashed, flash } = useFlashedRows();
  const addRow = useRef<HTMLDivElement>(null);

  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(emptyTemplateDraft);
  const [templateError, setTemplateError] = useState("");

  const sortedWorkflows = useMemo(() => [...workflows].sort((a, b) => a.sortOrder - b.sortOrder), [workflows]);
  const editing = sortedWorkflows.find((w) => w.id === editingId) ?? null;
  const editingPhases = useMemo(
    () => [...(editing?.phases ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [editing],
  );

  const reorderMutation = useActionMutation((orderedIds: string[]) => reorderWorkflowsAction(orderedIds), {
    optimistic: { onMutate: (client, ids) => reorderCachedEtapas(client, ids), rollback },
    ...etapasMutation(ETAPA_INVALIDATIONS),
  });
  const createMutation = useActionMutation(
    (input: { key: string; name: string; sortOrder: number }) => createWorkflowAction(input),
    {
      setData: (client, created) =>
        client.setQueryData<AjustesEtapasPageData>(PAGE_KEY, (current) =>
          current && !current.workflows.some((w) => w.id === created.id)
            ? {
                ...current,
                workflows: [...current.workflows, { ...created, phases: [], templates: [], readiness: null }],
              }
            : current,
        ),
      ...etapasMutation(ETAPA_INVALIDATIONS),
    },
  );
  const deleteMutation = useActionMutation((id: string) => deleteWorkflowAction(id), etapasMutation(ETAPA_INVALIDATIONS));
  const templateSaveMutation = useActionMutation(saveTemplateAction, etapasMutation(TEMPLATE_INVALIDATIONS));

  function reorder(orderedIds: string[]) {
    setPageError("");
    reorderMutation.mutateAsync(orderedIds).catch((err: unknown) => setPageError(etapasErrorText(err)));
  }

  async function createEtapa(name: string) {
    setPageError("");
    const taken = new Set(workflows.map((w) => w.key));
    const sortOrder = workflows.reduce((max, w) => Math.max(max, w.sortOrder), -1) + 1;
    try {
      const created = await createMutation.mutateAsync({ key: etapaKeyFor(name, taken), name, sortOrder });
      flash(created.id);
    } catch (err) {
      setPageError(etapasErrorText(err));
      throw err;
    }
  }

  function askDelete(workflow: WorkflowDetail) {
    setDeleteError("");
    setDeleting(workflow);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError("");
    try {
      await deleteMutation.mutateAsync(deleting.id);
      if (editingId === deleting.id) setEditingId(null);
      setDeleting(null);
    } catch (err) {
      setDeleteError(etapasErrorText(err));
    }
  }

  // ── Tareas de plantilla ─────────────────────────────────────────────────
  /** Active fases for the drawer select; keeps the edited template's own fase if it was deactivated. */
  const drawerPhases = useMemo<WorkflowPhaseRef[]>(
    () => editingPhases.filter((p) => p.active || p.id === draft.phaseId),
    [editingPhases, draft.phaseId],
  );

  function pickTemplate(value: string) {
    if (!editing) return;
    setTemplateError("");
    if (value === NEW_TEMPLATE) {
      setEditingTemplateId(null);
      setDraft(emptyTemplateDraft);
    } else {
      const template = editing.templates.find((t) => t.id === value);
      if (!template) return;
      setEditingTemplateId(template.id);
      setDraft(toDraft(template));
    }
    setShowTemplateEditor(true);
  }

  async function saveTemplate() {
    if (!editing) return;
    if (!draft.title.trim()) {
      setTemplateError("Escribe un nombre.");
      return;
    }
    if (!draft.phaseId) {
      setTemplateError("Elige una fase.");
      return;
    }
    const hours = draft.defaultEstimatedHours.trim();
    if (hours && !(Number(hours) > 0 && Number(hours) <= 80)) {
      setTemplateError("Las horas estimadas van de 0.5 a 80.");
      return;
    }
    const phaseName = editingPhases.find((p) => p.id === draft.phaseId)?.name ?? "";
    setTemplateError("");
    try {
      await templateSaveMutation.mutateAsync({
        workflowId: editing.id,
        templateId: editingTemplateId,
        input: toInput(draft),
      });
      setShowTemplateEditor(false);
    } catch (err) {
      setTemplateError(etapasErrorText(err, { kind: "template", phaseName }));
    }
  }

  const columns = useMemo<ColumnDef<WorkflowDetail, unknown>[]>(() => {
    const base: ColumnDef<WorkflowDetail, unknown>[] = [
      {
        accessorKey: "name",
        header: "Etapa",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium text-foreground">{row.original.name}</span>
            {!row.original.active ? <Badge variant="outline">Inactivo</Badge> : null}
          </span>
        ),
      },
      {
        id: "color",
        header: "Color",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-full", etapaColorClass(row.original))} />
            <span className="font-mono text-[13px]">{colorName(row.original)}</span>
          </span>
        ),
      },
      {
        id: "phases",
        header: () => <span className="block text-right">Fases</span>,
        cell: ({ row }) => <MonoCount>{row.original.phases.length}</MonoCount>,
      },
      {
        id: "templates",
        header: () => <span className="block text-right">Plantillas</span>,
        cell: ({ row }) => <MonoCount>{row.original.templates.filter((t) => t.active).length}</MonoCount>,
      },
      {
        id: "activeProjects",
        header: () => <span className="block text-right">Proyectos activos</span>,
        cell: ({ row }) => <MonoCount>{activeProjects[row.original.id] ?? 0}</MonoCount>,
      },
    ];
    if (!canManage) return base;
    const actions: ColumnDef<WorkflowDetail, unknown> = {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <CatalogRowMenu
          name={row.original.name}
          actionId={`etapa-${row.original.id}`}
          actions={[
            { label: "Editar", onSelect: () => setEditingId(row.original.id) },
            {
              label: "Eliminar",
              destructive: true,
              disabledReason: (activeProjects[row.original.id] ?? 0) > 0 ? "Lo usan proyectos activos." : null,
              onSelect: () => askDelete(row.original),
            },
          ]}
        />
      ),
    };
    return [...base, actions];
    // `askDelete` only sets state; the columns change with the capability and the counts.
  }, [canManage, activeProjects]);

  if (!capabilities.canViewWorkflows) {
    return (
      <section className="rounded-[14px] border border-border bg-card p-6 text-sm text-muted-foreground shadow-xs">
        No tienes permiso para ver las etapas.
      </section>
    );
  }

  const panel = editing ? (
    <EtapaEditor
      key={editing.id}
      workflow={editing}
      phases={editingPhases}
      isFirst={sortedWorkflows[0]?.id === editing.id}
      phaseTaskCounts={phaseTaskCounts}
      canManage={canManage}
      onClose={() => setEditingId(null)}
      onPickTemplate={pickTemplate}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {pageError ? (
        <Alert variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      <CatalogLayout panel={panel}>
        <section
          aria-labelledby="etapas-lista"
          className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5 text-card-foreground shadow-xs"
        >
          <CatalogListHeader
            id="etapas-lista"
            title="Etapas y fases"
            count={sortedWorkflows.length}
            description="El orden define el flujo de cada proyecto. Arrastra para reordenar."
            action={
              canManage ? (
                <CatalogCreateButton
                  label="Nueva etapa"
                  onClick={() => addRow.current?.querySelector<HTMLInputElement>("input")?.focus()}
                />
              ) : undefined
            }
          />
          <div className="min-w-0 overflow-x-auto">
            <DataTable
              columns={columns}
              data={sortedWorkflows}
              getRowId={(row) => row.id}
              getRowLabel={(row) => row.name}
              reorderHeader="Orden"
              onReorderRows={canManage ? reorder : undefined}
              onRowClick={canManage ? (row) => setEditingId(row.id) : undefined}
              rowClassName={(row) => rowNewClass(row.id, flashed)}
              emptyMessage="Aún no hay etapas."
            />
          </div>
          {canManage ? (
            <div ref={addRow}>
              <CatalogInlineAdd label="Agregar etapa" placeholder="Agregar etapa…" onCreate={createEtapa} />
            </div>
          ) : null}
        </section>
      </CatalogLayout>

      <TemplateTaskDrawer
        show={showTemplateEditor}
        onClose={() => setShowTemplateEditor(false)}
        editingId={editingTemplateId}
        workflowName={editing?.name ?? ""}
        phases={drawerPhases}
        draft={draft}
        onChangeDraft={setDraft}
        formError={templateError}
        onSave={() => void saveTemplate()}
        canSave={canManage}
        isSaving={templateSaveMutation.isPending}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(next) => (next ? undefined : setDeleting(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la etapa «{deleting?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Sus fases y tareas de plantilla dejan de usarse en proyectos nuevos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void confirmDelete()}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The 5 color swatches of an etapa (`role="radiogroup"` "Color de la etapa"; arrow keys move the choice). */
function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: EtapaColorSlot | null;
  onChange: (slot: EtapaColorSlot) => void;
  disabled: boolean;
}) {
  const refs = useRef(new Map<EtapaColorSlot, HTMLButtonElement>());
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, slot: EtapaColorSlot) {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !back) return;
    event.preventDefault();
    const count = ETAPA_COLOR_SLOTS.length;
    const next = ETAPA_COLOR_SLOTS[(ETAPA_COLOR_SLOTS.indexOf(slot) + (forward ? 1 : -1) + count) % count];
    onChange(next);
    refs.current.get(next)?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Color de la etapa" className="flex flex-wrap gap-3">
      {ETAPA_COLOR_SLOTS.map((slot) => {
        const checked = value === slot;
        return (
          <button
            key={slot}
            ref={(node) => {
              if (node) refs.current.set(slot, node);
              else refs.current.delete(slot);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={ETAPA_COLOR_NAMES[slot]}
            tabIndex={checked || (value === null && slot === 1) ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(slot)}
            onKeyDown={(event) => onKeyDown(event, slot)}
            className={cn(
              "size-7 rounded-full ring-offset-2 ring-offset-card outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              COLOR_BG[slot],
              checked && "ring-2 ring-ring",
            )}
          />
        );
      })}
    </div>
  );
}

/**
 * The editor of one etapa ("Editar etapa · {nombre}"): name, color, its
 * fases (reorder, rename, add, activate), "Iniciar automáticamente" and the
 * template picker. "Guardar cambios" saves the name, the color and the
 * renamed fases; reorders, new fases, the fase state and the switch save at
 * once.
 */
function EtapaEditor({
  workflow,
  phases,
  isFirst,
  phaseTaskCounts,
  canManage,
  onClose,
  onPickTemplate,
}: {
  workflow: WorkflowDetail;
  phases: WorkflowPhase[];
  isFirst: boolean;
  phaseTaskCounts: Readonly<Record<string, number>>;
  canManage: boolean;
  onClose: () => void;
  onPickTemplate: (value: string) => void;
}) {
  const [name, setName] = useState(workflow.name);
  const [colorSlot, setColorSlot] = useState<EtapaColorSlot | null>(etapaColorSlot(workflow));
  const [colorTouched, setColorTouched] = useState(false);
  const [phaseNames, setPhaseNames] = useState<Record<string, string>>({});
  const [newPhaseIds, setNewPhaseIds] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState("");
  const autoStartInFlight = useRef(false);

  const saveMutation = useActionMutation(saveEtapa, etapasMutation(ETAPA_INVALIDATIONS));
  const phaseCreateMutation = useActionMutation(
    (phaseName: string) => createWorkflowPhaseAction(workflow.id, { name: phaseName }),
    etapasMutation(PHASE_INVALIDATIONS),
  );
  const phaseActiveMutation = useActionMutation(
    ({ phaseId, active }: { phaseId: string; active: boolean }) => updateWorkflowPhaseAction(phaseId, { active }),
    etapasMutation(PHASE_INVALIDATIONS),
  );
  const phaseOrderMutation = useActionMutation(
    (orderedIds: string[]) => reorderWorkflowPhasesAction(workflow.id, orderedIds),
    {
      optimistic: { onMutate: (client, ids) => reorderCachedPhases(client, workflow.id, ids), rollback },
      ...etapasMutation(PHASE_INVALIDATIONS),
    },
  );
  const autoStartMutation = useActionMutation(
    (autoStart: boolean) => setWorkflowAutoStartAction(workflow.id, autoStart),
    etapasMutation(AUTO_START_INVALIDATIONS),
  );

  /** Runs one write; its error shows in the editor footer with the Etapas copy. */
  async function run(action: () => Promise<unknown>, context: EtapasErrorContext = { kind: "other" }) {
    setError("");
    try {
      await action();
      return true;
    } catch (err) {
      setError(etapasErrorText(err, context));
      return false;
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Escribe un nombre.");
      return;
    }
    const renames: SaveEtapaVars["renames"] = [];
    for (const phase of phases) {
      const next = phaseNames[phase.id]?.trim();
      if (next === undefined || next === phase.name) continue;
      if (!next) {
        setError("Escribe un nombre.");
        return;
      }
      renames.push({ phaseId: phase.id, name: next });
    }
    const patch: SaveEtapaVars["patch"] = {};
    if (trimmed !== workflow.name) patch.name = trimmed;
    if (colorTouched && colorSlot !== (workflow.colorSlot ?? null)) patch.colorSlot = colorSlot;
    const ok = await run(() => saveMutation.mutateAsync({ workflowId: workflow.id, patch, renames }), {
      kind: "phase",
      workflowName: trimmed,
    });
    if (ok) onClose();
  }

  async function createPhase(phaseName: string) {
    setError("");
    try {
      const created = await phaseCreateMutation.mutateAsync(phaseName);
      setNewPhaseIds((current) => new Set(current).add(created.id));
    } catch (err) {
      setError(etapasErrorText(err, { kind: "phase", workflowName: workflow.name }));
      throw err;
    }
  }

  async function toggleAutoStart(next: boolean) {
    // The switch sits in a <label>, so one click can report twice before `isPending` renders: send one POST.
    if (autoStartInFlight.current) return;
    autoStartInFlight.current = true;
    try {
      await run(() => autoStartMutation.mutateAsync(next));
    } finally {
      autoStartInFlight.current = false;
    }
  }

  const templateCount = workflow.templates.filter((t) => t.active).length;
  const sortedTemplates = sortTemplatesByPhase(workflow.templates, phases);
  const templateItems: Record<string, string> = {
    [NEW_TEMPLATE]: "Nueva tarea de plantilla",
    ...Object.fromEntries(sortedTemplates.map((t) => [t.id, `${t.phaseName || "Sin fase"} · ${t.title}`])),
  };
  const canAddTemplate = phases.some((p) => p.active);
  const dotSlot = colorTouched ? colorSlot : etapaColorSlot(workflow);

  return (
    <CatalogEditorPanel
      title={`Editar etapa · ${workflow.name}`}
      open
      width={360}
      onClose={onClose}
      returnFocus={() => catalogActionTrigger(`etapa-${workflow.id}`)}
      titleAdornment={
        <span
          aria-hidden="true"
          className={cn("size-2.5 shrink-0 rounded-full", dotSlot ? COLOR_BG[dotSlot] : "bg-muted-foreground")}
        />
      }
      footer={
        <CatalogPanelFooter
          onCancel={onClose}
          saveLabel="Guardar cambios"
          saving={saveMutation.isPending}
          canSave={canManage}
          onSave={() => void save()}
          error={error || null}
        />
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="etapa-name">Nombre</Label>
        <Input
          id="etapa-name"
          value={name}
          maxLength={120}
          disabled={!canManage}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Color</span>
        <ColorPicker
          value={colorSlot}
          disabled={!canManage}
          onChange={(slot) => {
            setColorSlot(slot);
            setColorTouched(true);
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Fases</span>
          <Badge variant="count">{phases.length}</Badge>
        </div>
        <PhaseListEditor
          workflowName={workflow.name}
          phases={phases}
          taskCounts={phaseTaskCounts}
          names={phaseNames}
          onNameChange={(phaseId, value) => setPhaseNames((current) => ({ ...current, [phaseId]: value }))}
          newIds={newPhaseIds}
          canManage={canManage}
          onReorder={(ids) => void run(() => phaseOrderMutation.mutateAsync(ids))}
          onCreate={createPhase}
          onSetActive={(phase, active) => void run(() => phaseActiveMutation.mutateAsync({ phaseId: phase.id, active }))}
        />
      </div>

      <label className="flex items-start gap-3 text-sm">
        <Switch
          checked={workflow.autoStart !== "manual"}
          disabled={!canManage || autoStartMutation.isPending}
          onCheckedChange={(checked) => void toggleAutoStart(Boolean(checked))}
        />
        <span>
          Iniciar automáticamente
          <span className="block text-muted-foreground">{autoStartHelpText(workflow, isFirst)}</span>
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <span id="etapa-plantillas-label" className="text-sm font-medium text-foreground">
          Plantilla de tareas
        </span>
        <Select
          items={templateItems}
          value={null}
          onValueChange={(next) => {
            if (typeof next === "string") onPickTemplate(next);
          }}
        >
          <SelectTrigger className="w-full" aria-labelledby="etapa-plantillas-label">
            <SelectValue placeholder={`${workflow.name} (${templateCount} plantillas)`} />
          </SelectTrigger>
          <SelectContent>
            {canManage ? (
              <SelectItem value={NEW_TEMPLATE} disabled={!canAddTemplate}>
                Nueva tarea de plantilla
              </SelectItem>
            ) : null}
            {sortedTemplates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {templateItems[template.id]}
                {template.active ? null : " (inactiva)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </CatalogEditorPanel>
  );
}
