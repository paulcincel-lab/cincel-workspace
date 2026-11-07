"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { ChecklistAddItemInput, ChecklistItemRow } from "@/components/tareas/ChecklistItemRow";
import { ChecklistProgressCell } from "@/components/tareas/ChecklistProgressCell";
import { Progress } from "@/components/ui/shadcn/progress";
import { RecordTable } from "@/components/widgets/RecordTable";
import { addChecklistItemAction, toggleChecklistItemAction } from "@/lib/actions/my-space-actions";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { actionErrorText } from "@/lib/errors";
import type { Checklist, ChecklistItem } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

export type ChecklistCardProps = { checklist: Checklist; onChange(c: Checklist): void };

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
 * (`ChecklistItemRow`, `ChecklistProgressCell`); toggles are optimistic and
 * roll back with an error toast.
 */
export function ChecklistCard({ checklist, onChange }: ChecklistCardProps) {
  const headingId = useId();
  const inputId = useId();
  const canToggle = IMPLEMENTED.toggleChecklistItemAction;
  const canAdd = IMPLEMENTED.addChecklistItemAction;

  // Local copy so the card updates before the parent echoes `onChange`; a new
  // `checklist` prop replaces it.
  const [current, setCurrent] = useState(checklist);
  const [source, setSource] = useState(checklist);
  if (checklist !== source) {
    setSource(checklist);
    setCurrent(checklist);
  }
  const latest = useRef(checklist);
  useEffect(() => {
    latest.current = checklist;
  }, [checklist]);

  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const commit = (next: Checklist) => {
    latest.current = next;
    setCurrent(next);
    onChange(next);
  };

  const toggle = async (itemId: string) => {
    if (!canToggle) return;
    const item = latest.current.items.find((i) => i.id === itemId);
    if (!item) return;
    const done = !item.done;
    commit(withItem(latest.current, itemId, { done }));
    try {
      const saved = await toggleChecklistItemAction(itemId, done);
      commit(withItem(latest.current, itemId, saved));
    } catch (err) {
      commit(withItem(latest.current, itemId, { done: !done }));
      toast.error(actionErrorText(err));
    }
  };

  const add = async () => {
    if (!canAdd || adding) return;
    const text = draft.trim();
    if (!text) {
      setAddError(actionErrorText("INVALID"));
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const item = await addChecklistItemAction(latest.current.id, text);
      commit({ ...latest.current, items: [...latest.current.items, item] });
      setDraft("");
    } catch (err) {
      setAddError(actionErrorText(err));
    } finally {
      setAdding(false);
    }
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
              onToggle={() => void toggle(String(row.id))}
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
          onSubmit={() => void add()}
          error={addError}
        />
      ) : null}
    </section>
  );
}
