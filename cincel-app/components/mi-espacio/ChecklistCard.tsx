"use client";

import { useId, useState } from "react";

import { ChecklistAddItemInput, ChecklistItemRow } from "@/components/tareas/ChecklistItemRow";
import { ChecklistProgressCell } from "@/components/tareas/ChecklistProgressCell";
import { Progress } from "@/components/ui/shadcn/progress";
import { RecordTable } from "@/components/widgets/RecordTable";
import { addChecklistItemAction, toggleChecklistItemAction } from "@/lib/actions/my-space-actions";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { useActionMutation } from "@/lib/query/mutation";
import {
  restoreSnapshot,
  snapshotChecklists,
  updateCachedChecklist,
  type ChecklistsData,
  type Snapshot,
} from "@/lib/query/options/mi-espacio";
import type { Checklist, ChecklistItem } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

/** `checklist` is the row of the `me.checklists` query; the card's writes patch that query. */
export type ChecklistCardProps = { checklist: Checklist };

/** Done / total / whole percent of a checklist. */
export function checklistProgress(checklist: Checklist): { done: number; total: number; pct: number } {
  const total = checklist.items.length;
  const done = checklist.items.filter((item) => item.done).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function withItem(checklist: Checklist, itemId: string, patch: Partial<ChecklistItem>): Checklist {
  return {
    ...checklist,
    items: checklist.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
  };
}

/**
 * Summary of the list. Visual: counter + progress bar; Esencial: counter only;
 * Analítico: Lista, Hechos, Total, %. Which columns show per style is decided
 * by `RecordTable` through `hideOn`.
 */
function summaryTable(checklist: Checklist): RecordTableData {
  const { done, total, pct } = checklistProgress(checklist);
  return {
    columns: [
      { key: "resumen", label: "Avance", hideOn: ["analitico"] },
      { key: "barra", label: "Progreso", hideOn: ["esencial", "analitico"] },
      { key: "lista", label: "Lista", hideOn: ["visual", "esencial"] },
      { key: "hechos", label: "Hechos", align: "right", mono: true, format: "count", hideOn: ["visual", "esencial"] },
      { key: "total", label: "Total", align: "right", mono: true, format: "count", hideOn: ["visual", "esencial"] },
      { key: "pct", label: "%", align: "right", mono: true, format: "percent", hideOn: ["visual", "esencial"] },
    ],
    rows: [{ id: checklist.id, resumen: `${done}/${total}`, barra: pct, lista: checklist.title, hechos: done, total, pct }],
  };
}

function itemsTable(checklist: Checklist): RecordTableData {
  return {
    columns: [{ key: "punto", label: "Punto" }],
    rows: checklist.items.map((item) => ({ id: item.id, punto: item.text, done: item.done })),
  };
}

/**
 * One checklist (redesign FE §3.3, §4.4): title, n/m, progress, checkbox items
 * and the add-item input. Rows are the task checklist rows
 * (`ChecklistItemRow`, `ChecklistProgressCell`). A toggle is one POST: it
 * patches `me.checklists` at once and rolls back with the error toast; no
 * route re-render.
 */
export function ChecklistCard({ checklist: current }: ChecklistCardProps) {
  const headingId = useId();
  const inputId = useId();
  const canToggle = IMPLEMENTED.toggleChecklistItemAction;
  const canAdd = IMPLEMENTED.addChecklistItemAction;
  const checklistId = current.id;

  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const toggleMutation = useActionMutation<{ itemId: string; done: boolean }, ChecklistItem, Snapshot<ChecklistsData>>(
    ({ itemId, done }) => toggleChecklistItemAction(itemId, done),
    {
      optimistic: {
        async onMutate(qc, { itemId, done }) {
          const snap = await snapshotChecklists(qc);
          updateCachedChecklist(qc, checklistId, (c) => withItem(c, itemId, { done }));
          return snap;
        },
        rollback: restoreSnapshot,
      },
      setData: (qc, saved, { itemId }) => updateCachedChecklist(qc, checklistId, (c) => withItem(c, itemId, saved)),
    },
  );

  const addMutation = useActionMutation<string, ChecklistItem>((text) => addChecklistItemAction(checklistId, text), {
    setData: (qc, item) => {
      updateCachedChecklist(qc, checklistId, (c) => ({ ...c, items: [...c.items.filter((i) => i.id !== item.id), item] }));
      setDraft("");
    },
    onFormError: setAddError,
  });

  const toggle = (itemId: string) => {
    if (!canToggle) return;
    const item = current.items.find((i) => i.id === itemId);
    if (!item) return;
    toggleMutation.mutate({ itemId, done: !item.done });
  };

  const add = () => {
    if (!canAdd || addMutation.isPending) return;
    const text = draft.trim();
    if (!text) {
      setAddError(actionErrorText("INVALID"));
      return;
    }
    setAddError(null);
    addMutation.mutate(text);
  };

  const { done, total, pct } = checklistProgress(current);

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-sm font-semibold text-foreground">
        {current.title}
      </h3>
      <RecordTable
        data={summaryTable(current)}
        renderCell={(key) => {
          if (key === "resumen") {
            return total === 0 ? (
              <span className="text-sm tabular-nums">0/0</span>
            ) : (
              <ChecklistProgressCell total={total} completed={done} />
            );
          }
          if (key === "barra") return <Progress value={pct} aria-label={`Avance de ${current.title}`} />;
          if (key === "pct") return `${pct}%`;
          return undefined;
        }}
      />
      <RecordTable
        data={itemsTable(current)}
        emptyState={{ title: "Sin puntos de checklist." }}
        renderCell={(key, row) =>
          key === "punto" ? (
            <ChecklistItemRow
              label={String(row.punto)}
              checked={row.done === true}
              disabled={!canToggle}
              onToggle={() => toggle(String(row.id))}
            />
          ) : undefined
        }
      />
      {canAdd ? (
        <ChecklistAddItemInput
          id={inputId}
          value={draft}
          onValueChange={(value) => {
            setDraft(value);
            if (addError) setAddError(null);
          }}
          onSubmit={add}
          error={addError}
        />
      ) : null}
    </section>
  );
}
