"use client";

import { useMemo, useRef, useState } from "react";
import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { CatalogLayout } from "@/components/ajustes/CatalogEditorPanel";
import {
  CatalogCreateButton,
  CatalogInlineAdd,
  CatalogListHeader,
  CatalogRowMenu,
  MonoCount,
  catalogActionTrigger,
  rowNewClass,
  useFlashedRows,
} from "@/components/ajustes/catalog-parts";
import { PositionEditorDrawer, type PositionDraft } from "@/components/configuracion/PositionEditorDrawer";
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
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/shadcn/avatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { TableCell, TableRow } from "@/components/ui/shadcn/table";
import { unwrapActionResult } from "@/lib/actions/action-result";
import {
  createPositionAction,
  deletePositionAction,
  reorderPositionsAction,
  setPositionPhasesAction,
  updatePositionAction,
} from "@/lib/actions/positions-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesPuestosOptions, type AjustesPuestosPageData } from "@/lib/query/options/ajustes";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { resolvePositionsCapabilities } from "@/lib/auth/permissions";
import { tramoColorClass } from "@/lib/tramos/tramo-color";
import type { Position, WorkflowDetail } from "@/lib/types/core";
import { cn } from "@/lib/utils";

const ERROR_COPY: Record<string, string> = {
  FORBIDDEN: "No tienes permiso para realizar esta acción.",
  NOT_FOUND: "Ya no existe. Recarga la página.",
  EMPTY: "Escribe un nombre.",
  NAME_TAKEN: "Ya existe un puesto con ese nombre.",
  IN_USE: "Este puesto se asigna desde un grupo de Google. Quita el grupo en Configuración → Google primero.",
  INVALID: "Revisa los datos: la capacidad va de 0 a 80 horas.",
};

/** Tooltip of the disabled "Eliminar" on a Google-managed puesto. */
export const GOOGLE_MANAGED_DELETE_REASON = "Lo usa un grupo de Google.";

/** Chips and avatars shown before collapsing the rest into "+{n}". */
const SHOWN = 2;

/** Spanish copy for a puestos action error (`"CODE"` or `"CODE: detail"`). */
export function positionErrorText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  const code = message.split(":")[0]?.trim() ?? "";
  return ERROR_COPY[code] ?? fallback;
}

function integrantesLabel(count: number): string {
  return count === 1 ? "1 integrante lo perderá." : `${count} integrantes lo perderán.`;
}

/** Members of a puesto: the active holders when loaded, else the holder count. */
function memberCount(position: Position): number {
  return position.members ? position.members.length : position.staffCount;
}

/** Footer totals: puestos, distinct people and Σ capacity × members (hours per week). */
export function puestosTotals(positions: readonly Position[]): { puestos: number; personas: number; hours: number } {
  const people = new Set<string>();
  let hours = 0;
  for (const position of positions) {
    for (const member of position.members ?? []) people.add(member.id);
    hours += (position.weeklyCapacityHours ?? 0) * memberCount(position);
  }
  return { puestos: positions.length, personas: people.size, hours };
}

/**
 * What a puesto change makes stale (plan §3, Positions): this page, the
 * Personas team view (puestos per person), the assignee pickers (suggested
 * staff per tramo) and Ajustes › Google (the puestos a mapping can use).
 */
export const POSITION_INVALIDATIONS = [
  qk.ajustes.page("puestos"),
  qk.personas.equipo(),
  ["catalog", "assignable-staff"],
  qk.ajustes.page("google"),
] as const;

/** Reorders the cached puestos to `orderedIds` and returns the previous page data for the rollback. */
export async function reorderCachedPositions(
  qc: QueryClient,
  orderedIds: string[],
): Promise<AjustesPuestosPageData | undefined> {
  const key = qk.ajustes.page("puestos");
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<AjustesPuestosPageData>(key);
  if (previous) {
    const byId = new Map(previous.positions.map((position) => [position.id, position]));
    const positions = orderedIds.map((id) => byId.get(id)).filter((p): p is Position => Boolean(p));
    qc.setQueryData<AjustesPuestosPageData>(key, { ...previous, positions });
  }
  return previous;
}

type SaveVars = {
  /** The puesto being edited, or null for a new one. */
  id: string | null;
  name: string;
  weeklyCapacityHours: number | null;
  phaseIds: string[];
  /** Called with the saved puesto before its fases are saved. */
  onSaved: (saved: Position) => void;
};

/** Create or update, then replace the candidate fases: two POSTs in sequence (the fases need the id). */
async function savePosition({ id, name, weeklyCapacityHours, phaseIds, onSaved }: SaveVars) {
  const input = { name, weeklyCapacityHours };
  const saved = unwrapActionResult(id ? await updatePositionAction(id, input) : await createPositionAction(input));
  onSaved(saved);
  return setPositionPhasesAction(saved.id, phaseIds);
}

/** A candidate fase chip (12 px, pill) with its tramo's color dot. */
function PhaseChip({ label, tramo }: { label: string; tramo: WorkflowDetail | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", tramoColorClass(tramo ?? null))} />
      {label}
    </span>
  );
}

/**
 * Ajustes › Puestos (frame `Ajustes-Puestos`): the list of puestos with their
 * candidate fases, members and weekly capacity, and the editor next to it.
 * Reads `qk.ajustes.page('puestos')`, hydrated by the page (no fetch on
 * mount). Every write invalidates `POSITION_INVALIDATIONS`; a reorder (mouse
 * or keyboard) is optimistic on the cache and rolls back with a toast.
 */
export function PuestosClient() {
  const { positions, workflows } = useSuspenseQuery(ajustesPuestosOptions()).data;
  const authenticatedUser = useSessionStore(selectCurrentUser);
  const canManage = useMemo(
    () => resolvePositionsCapabilities(authenticatedUser).canManagePositions,
    [authenticatedUser],
  );
  const workflowsById = useMemo(() => new Map(workflows.map((w) => [w.id, w])), [workflows]);

  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [formError, setFormError] = useState("");
  /** The row whose "•••" gets focus back when the editor closes. */
  const focusRowId = useRef<string | null>(null);

  const [deleting, setDeleting] = useState<Position | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [addError, setAddError] = useState("");
  const { flashed, flash } = useFlashedRows();

  const saveMutation = useActionMutation(savePosition, {
    invalidate: POSITION_INVALIDATIONS,
    // The editor shows the error inline with the puestos copy (`save()`).
    onFormError: () => undefined,
  });

  const createMutation = useActionMutation((name: string) => createPositionAction({ name }), {
    invalidate: POSITION_INVALIDATIONS,
    onFormError: () => undefined,
  });

  const deleteMutation = useActionMutation((id: string) => deletePositionAction(id), {
    invalidate: POSITION_INVALIDATIONS,
    onFormError: () => undefined,
  });

  const reorderMutation = useActionMutation((orderedIds: string[]) => reorderPositionsAction(orderedIds), {
    optimistic: {
      onMutate: (qc, orderedIds) => reorderCachedPositions(qc, orderedIds),
      rollback: (qc, previous) => {
        if (previous) qc.setQueryData(qk.ajustes.page("puestos"), previous);
      },
    },
    invalidate: POSITION_INVALIDATIONS,
    errorContext: { entity: "position" },
  });

  function openNew() {
    focusRowId.current = null;
    setEditing(null);
    setFormError("");
    setShowEditor(true);
  }

  function openEdit(position: Position) {
    focusRowId.current = position.id;
    setEditing(position);
    setFormError("");
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditing(null);
  }

  async function save(draft: PositionDraft) {
    const name = draft.name.trim();
    if (!name) {
      setFormError(ERROR_COPY.EMPTY);
      return;
    }

    setFormError("");
    try {
      await saveMutation.mutateAsync({
        id: editing?.id ?? null,
        name,
        weeklyCapacityHours: draft.weeklyCapacityHours,
        phaseIds: draft.phaseIds,
        // Keep the saved puesto as the one being edited, so a failed fase save retries an update, not a second create.
        onSaved: setEditing,
      });
      closeEditor();
    } catch (error) {
      setFormError(positionErrorText(error, "No se pudo guardar el puesto."));
    }
  }

  /** Inline add: Enter creates the puesto with that name and flashes its row. */
  async function createInline(name: string) {
    setAddError("");
    try {
      const created = await createMutation.mutateAsync(name);
      flash(created.id);
    } catch (error) {
      setAddError(positionErrorText(error, "No se pudo crear el puesto."));
      throw error;
    }
  }

  function askDelete(position: Position) {
    setDeleteError("");
    setDeleting(position);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError("");
    try {
      await deleteMutation.mutateAsync(deleting.id);
      if (editing?.id === deleting.id) closeEditor();
      setDeleting(null);
    } catch (error) {
      setDeleteError(positionErrorText(error, "No se pudo eliminar el puesto."));
    }
  }

  function reorder(orderedIds: string[]) {
    reorderMutation.mutate(orderedIds);
  }

  const columns = useMemo<ColumnDef<Position, unknown>[]>(
    () => [
      {
        id: "order",
        header: "Orden",
        cell: ({ row }) => <span className="font-mono text-[13px] text-muted-foreground">{row.index + 1}</span>,
      },
      {
        accessorKey: "name",
        header: "Puesto",
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        id: "phases",
        header: "Fases candidatas",
        cell: ({ row }) => {
          const phases = row.original.phases;
          if (phases.length === 0) return <span className="text-sm text-muted-foreground">Sin fases</span>;
          const rest = phases.length - SHOWN;
          return (
            <div className="flex flex-wrap gap-1">
              {phases.slice(0, SHOWN).map((phase) => (
                <PhaseChip
                  key={phase.id}
                  label={`${phase.workflowName} · ${phase.name}`}
                  tramo={workflowsById.get(phase.workflowId)}
                />
              ))}
              {rest > 0 ? (
                <span
                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  title={phases
                    .slice(SHOWN)
                    .map((phase) => `${phase.workflowName} · ${phase.name}`)
                    .join(", ")}
                >
                  +{rest}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "members",
        header: "Integrantes",
        cell: ({ row }) => {
          const members = row.original.members ?? [];
          const rest = members.length - SHOWN;
          return (
            <div className="flex items-center gap-2">
              {members.length > 0 ? (
                <AvatarGroup className="-space-x-1.5" aria-hidden="true">
                  {members.slice(0, SHOWN).map((member) => (
                    <Avatar key={member.id} size="sm" title={member.name}>
                      <AvatarFallback>{member.initials}</AvatarFallback>
                    </Avatar>
                  ))}
                  {rest > 0 ? <AvatarGroupCount className="text-xs">+{rest}</AvatarGroupCount> : null}
                </AvatarGroup>
              ) : null}
              <span className="font-mono text-[13px] tabular-nums">{memberCount(row.original)}</span>
            </div>
          );
        },
      },
      {
        id: "capacity",
        header: () => (
          <span className="inline-flex items-center gap-1.5">
            Capacidad / semana
            <Badge variant="secondary">nuevo</Badge>
          </span>
        ),
        cell: ({ row }) => {
          const hours = row.original.weeklyCapacityHours;
          return <MonoCount>{hours === null || hours === undefined ? "—" : `${hours} h`}</MonoCount>;
        },
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Acciones</span>,
              cell: ({ row }) => (
                <CatalogRowMenu
                  name={row.original.name}
                  actionId={row.original.id}
                  actions={[
                    { label: "Editar", onSelect: () => openEdit(row.original) },
                    {
                      label: "Eliminar",
                      destructive: true,
                      disabledReason: row.original.googleManaged ? GOOGLE_MANAGED_DELETE_REASON : null,
                      onSelect: () => askDelete(row.original),
                    },
                  ]}
                />
              ),
            } satisfies ColumnDef<Position, unknown>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, workflowsById],
  );

  const totals = puestosTotals(positions);
  // The grip column DataTable adds while reordering is on.
  const colSpan = columns.length + (canManage ? 1 : 0);

  return (
    <CatalogLayout
      panel={
        <PositionEditorDrawer
          show={showEditor}
          onClose={closeEditor}
          position={editing}
          workflows={workflows}
          canManage={canManage}
          isSaving={saveMutation.isPending}
          formError={formError}
          onSave={(draft) => void save(draft)}
          onDelete={askDelete}
          returnFocus={() => catalogActionTrigger(focusRowId.current)}
        />
      }
    >
      <section
        aria-labelledby="puestos-title"
        className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5 text-card-foreground shadow-xs"
      >
        <CatalogListHeader
          id="puestos-title"
          title="Puestos"
          count={positions.length}
          description="Las fases candidatas solo se sugieren al asignar tareas; cualquiera puede asignarse."
          action={canManage ? <CatalogCreateButton label="Nuevo puesto" onClick={openNew} /> : undefined}
        />

        <DataTable
          columns={columns}
          data={positions}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.name}
          onRowClick={canManage ? (row) => openEdit(row) : undefined}
          onReorderRows={canManage ? reorder : undefined}
          rowClassName={(row) => rowNewClass(row.id, flashed)}
          headerClassName={(columnId) => (columnId === "capacity" ? "text-right" : undefined)}
          emptyMessage="Aún no hay puestos."
          footer={
            <TableRow>
              <TableCell colSpan={colSpan}>
                <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
                  <span>Total · {totals.puestos === 1 ? "1 puesto" : `${totals.puestos} puestos`}</span>
                  <span className="font-mono tabular-nums">
                    {totals.personas === 1 ? "1 persona" : `${totals.personas} personas`}
                  </span>
                  <span className="font-mono tabular-nums">{totals.hours} h</span>
                </div>
              </TableCell>
            </TableRow>
          }
        />

        {canManage ? (
          <CatalogInlineAdd
            label="Agregar puesto"
            placeholder="Agregar puesto…"
            onCreate={createInline}
            className="rounded-[10px] border border-dashed border-border"
          />
        ) : null}
        {addError ? (
          <Alert variant="destructive">
            <AlertDescription>{addError}</AlertDescription>
          </Alert>
        ) : null}

        <p className="text-[12.5px] text-muted-foreground">
          Capacidad / semana es nueva: alimenta la carga de Personas (horas asignadas ÷ capacidad).
        </p>
      </section>

      <AlertDialog open={deleting !== null} onOpenChange={(next) => (next ? undefined : setDeleting(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el puesto {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? integrantesLabel(deleting.staffCount) : null}
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
    </CatalogLayout>
  );
}
