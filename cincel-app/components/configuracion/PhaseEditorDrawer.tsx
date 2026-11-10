"use client";

import { useState, type DragEvent } from "react";
import { GripVertical } from "lucide-react";

import { CatalogInlineAdd, CatalogRowMenu, NewPill } from "@/components/ajustes/catalog-parts";
import { Badge } from "@/components/ui/shadcn/badge";
import { useKeyboardReorder } from "@/components/ui/use-keyboard-reorder";
import { cn } from "@/lib/utils";
import type { WorkflowPhase } from "@/lib/types/core";

export interface PhaseListEditorProps {
  /** The tramo's name, for the labels. */
  workflowName: string;
  /** The tramo's fases in catalog order (inactive ones included). */
  phases: WorkflowPhase[];
  /** phaseId → live tasks in it. */
  taskCounts: Readonly<Record<string, number>>;
  /** Edited names (phaseId → name); a fase not in it shows its saved name. */
  names: Readonly<Record<string, string>>;
  onNameChange: (phaseId: string, name: string) => void;
  /** Fases created in this session: they carry the "Nueva" pill. */
  newIds: ReadonlySet<string>;
  canManage: boolean;
  /** Called once on drop (pointer or keyboard) with the new order. */
  onReorder: (orderedIds: string[]) => void;
  /** Creates a fase appended last; throws to keep the typed name. */
  onCreate: (name: string) => Promise<unknown>;
  onSetActive: (phase: WorkflowPhase, active: boolean) => void;
}

function tasksText(n: number): string {
  return n === 1 ? "1 tarea" : `${n} tareas`;
}

/**
 * The fases of a tramo inside its editor (Ajustes › Tramos y fases): an
 * ordered list with a drag handle (pointer, or Space / ↑ / ↓ / Space), the
 * Geist Mono index, the name edited in place (saved with the tramo's
 * "Guardar cambios"), its task count, a "Nueva" pill for fases created here
 * and, last, the inline "Agregar fase…" row. Reorders persist on drop.
 */
export function PhaseListEditor({
  workflowName,
  phases,
  taskCounts,
  names,
  onNameChange,
  newIds,
  canManage,
  onReorder,
  onCreate,
  onSetActive,
}: PhaseListEditorProps) {
  const byId = new Map(phases.map((phase) => [phase.id, phase]));
  const keyboard = useKeyboardReorder({
    ids: phases.map((phase) => phase.id),
    labelOf: (id) => names[id] ?? byId.get(id)?.name ?? id,
    onReorder,
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const shown = keyboard.liftedId
    ? keyboard.order.map((id) => byId.get(id)).filter((phase): phase is WorkflowPhase => Boolean(phase))
    : phases;

  function drop(event: DragEvent, targetId: string) {
    event.preventDefault();
    const fromId = dragId;
    setDragId(null);
    setOverId(null);
    if (!fromId || fromId === targetId) return;
    const ids = phases.map((phase) => phase.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorder(ids);
  }

  return (
    <div className="flex flex-col gap-2">
      {shown.length === 0 ? <p className="text-[13px] text-muted-foreground">Este tramo aún no tiene fases.</p> : null}
      <ol aria-label={`Fases de ${workflowName}`} className="flex flex-col gap-1.5">
        {shown.map((phase, index) => {
          const name = names[phase.id] ?? phase.name;
          const inputId = `phase-name-${phase.id}`;
          return (
            <li
              key={phase.id}
              data-lifted={keyboard.liftedId === phase.id ? "true" : undefined}
              onDragOver={
                canManage && dragId
                  ? (event) => {
                      event.preventDefault();
                      setOverId(phase.id);
                    }
                  : undefined
              }
              onDrop={canManage && dragId ? (event) => drop(event, phase.id) : undefined}
              className={cn(
                "flex items-center gap-2 rounded-[10px] bg-sidebar px-2.5 py-2 text-sm",
                (overId === phase.id || keyboard.liftedId === phase.id) && "ring-2 ring-ring",
                newIds.has(phase.id) && "row-new",
              )}
            >
              {canManage ? (
                <button
                  type="button"
                  {...keyboard.handleProps(phase.id)}
                  draggable
                  onDragStart={() => setDragId(phase.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  title="Arrastra para reordenar"
                  className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                >
                  <GripVertical aria-hidden="true" className="size-4" />
                </button>
              ) : null}
              <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <label htmlFor={inputId} className="sr-only">
                Nombre de la fase {phase.name}
              </label>
              <input
                id={inputId}
                type="text"
                value={name}
                maxLength={120}
                disabled={!canManage}
                onChange={(event) => onNameChange(phase.id, event.target.value)}
                className={cn(
                  "h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !phase.active && "text-muted-foreground",
                )}
              />
              {newIds.has(phase.id) ? <NewPill label="Nueva" /> : null}
              {!phase.active ? <Badge variant="outline">Inactiva</Badge> : null}
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {tasksText(taskCounts[phase.id] ?? 0)}
              </span>
              {canManage ? (
                <CatalogRowMenu
                  name={phase.name}
                  actionId={`phase-${phase.id}`}
                  actions={[
                    phase.active
                      ? { label: "Desactivar", destructive: true, onSelect: () => onSetActive(phase, false) }
                      : { label: "Activar", onSelect: () => onSetActive(phase, true) },
                  ]}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {canManage ? (
        <CatalogInlineAdd
          label={`Agregar fase a ${workflowName}`}
          placeholder="Agregar fase…"
          onCreate={onCreate}
          className="rounded-[10px] border border-dashed border-border"
        />
      ) : null}
      <p aria-live="polite" className="sr-only">
        {keyboard.announcement}
      </p>
    </div>
  );
}
