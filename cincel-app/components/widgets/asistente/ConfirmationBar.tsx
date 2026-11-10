"use client";

import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { formatCount } from "@/lib/assistant/step-tables";
import type { ToolPreviewRow, ToolStepGroup } from "@/lib/assistant/tool-steps";

/**
 * The `table` variant of the grouped approval (Asistente Analítico): one bar
 * per pending same-tool group, "Paso {i} · {tool} × {n}", the diff of its
 * preview rows and Confirmar / Editar filas / Cancelar. Every answer covers
 * every approval id of the group, once.
 */
export type ConfirmationBarProps = {
  group: Extract<ToolStepGroup, { kind: "approval" }>;
  /** The group's row number in the steps table. */
  index: number;
  onApprove(approvalIds: string[], approved: boolean, reason?: string): void;
  /** "Editar filas": the group is denied (reason "editado") and its rows go to the composer as text. */
  onEditRows?(text: string): void;
};

/** Reason sent with the denial of "Editar filas". */
export const EDIT_REASON = "editado";

function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** "+4 tareas · 1 cambio · 2 borrados" (parts at 0 left out). */
export function previewDiff(preview: readonly ToolPreviewRow[]): string {
  const added = preview.filter((row) => row.op === "+").length;
  const changed = preview.filter((row) => row.op === "~").length;
  const removed = preview.filter((row) => row.op === "−").length;
  const parts: string[] = [];
  if (added > 0) parts.push(`+${plural(added, "tarea", "tareas")}`);
  if (changed > 0) parts.push(plural(changed, "cambio", "cambios"));
  if (removed > 0) parts.push(plural(removed, "borrado", "borrados"));
  return parts.join(" · ");
}

/** The rows as editable text for the composer ("Crea estas tareas:\n- Revisión · Ana Ruiz · 13 nov"). */
export function previewAsText(preview: readonly ToolPreviewRow[]): string {
  const lines = preview.map((row) => `- ${[row.title, row.person, row.date].filter(Boolean).join(" · ")}`);
  return ["Crea estas tareas:", ...lines].join("\n");
}

export function ConfirmationBar({ group, index, onApprove, onEditRows }: ConfirmationBarProps): ReactNode {
  const labelId = useId();
  // Locks on the first answer, so each approval id is sent once while the chat resubmits.
  const [answered, setAnswered] = useState(false);
  const pending = group.steps.filter((step) => step.state === "needs-confirmation" && step.approvalId);
  if (pending.length === 0) return null;
  const ids = pending.map((step) => step.approvalId as string);
  const n = group.steps.length;
  const diff = previewDiff(group.preview);

  function answer(approved: boolean, reason?: string) {
    if (answered) return;
    setAnswered(true);
    onApprove(ids, approved, reason);
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      data-slot="confirmation-bar"
      className="flex flex-wrap items-center gap-2.5 rounded-xl border border-chart-3 bg-tint-warning px-3 py-2.5"
    >
      <span id={labelId} className="text-[13.5px] font-semibold text-foreground">
        Paso {index} · {n > 1 ? `${group.toolName} × ${n}` : group.toolName}
      </span>
      {diff ? <span className="font-mono text-xs text-sidebar-foreground">{diff}</span> : null}
      <span className="flex-1" />
      <Button type="button" className="h-[30px] rounded-[10px] text-[13px] font-semibold" disabled={answered} onClick={() => answer(true)}>
        {n === 1 ? "Confirmar" : `Confirmar ${n}`}
      </Button>
      {onEditRows && group.preview.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="h-[30px] rounded-[10px] text-[13px]"
          disabled={answered}
          onClick={() => {
            if (answered) return;
            answer(false, EDIT_REASON);
            onEditRows(previewAsText(group.preview));
          }}
        >
          Editar filas
        </Button>
      ) : null}
      <Button type="button" variant="ghost" className="h-[30px] rounded-[10px] text-[13px]" disabled={answered} onClick={() => answer(false)}>
        Cancelar
      </Button>
    </div>
  );
}
