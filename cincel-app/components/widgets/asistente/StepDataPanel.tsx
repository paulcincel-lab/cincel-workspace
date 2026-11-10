"use client";

import { useMemo, type ReactNode } from "react";

import { GroupedTable, type Group, type GroupMetric } from "@/components/widgets/GroupedTable";
import { KpiStrip } from "@/components/widgets/KpiStrip";
import { RecordTable } from "@/components/widgets/RecordTable";
import { formatValue } from "@/components/widgets/record-table-format";
import {
  allSteps,
  approvalMeta,
  approvalTable,
  FLAT_GROUP_ID,
  formatCount,
  groupState,
  recordStepTable,
  STEP_TABLES,
  stepKpis,
  stepTableRowCount,
  stepTableRows,
  type StepRow,
  type StepTable,
} from "@/lib/assistant/step-tables";
import { toToolSteps, type ToolStep } from "@/lib/assistant/tool-steps";
import type { AssistantUIMessage } from "@/lib/types/asistente";
import type { RecordTableData } from "@/lib/types/widgets";

/**
 * Data panel of the Asistente Analítico (frame `Asistente-Analitico`): the
 * KPI strip of the selected assistant message and one card per step with
 * tabular output (grouped tables for the known tools, a record table for
 * the rest, the preview rows for an approval group). Not a live region.
 */
export type StepDataPanelProps = { message: AssistantUIMessage | null };

export const DATA_PANEL_EMPTY = "Aquí aparecen los datos de cada paso.";

type Card =
  | { kind: "grouped"; key: string; index: number; table: StepTable; metrics: GroupMetric[] }
  | { kind: "record"; key: string; index: number; title: string; data: RecordTableData };

function filas(n: number): string {
  return `${formatCount(n)} ${n === 1 ? "fila" : "filas"}`;
}

function stepCard(step: ToolStep, index: number): Card | null {
  if (step.state !== "done" || step.output === undefined) return null;
  const build = STEP_TABLES[step.toolName];
  const table = build ? build(step.output, undefined) : null;
  if (table) return { kind: "grouped", key: step.toolCallId, index, table, metrics: [] };
  if (build) return null;
  const data = recordStepTable(step.output);
  return data ? { kind: "record", key: step.toolCallId, index, title: step.short, data } : null;
}

function cardsOf(message: AssistantUIMessage): Card[] {
  const cards: Card[] = [];
  for (const row of stepTableRows(toToolSteps(message))) {
    const group = row.group;
    if (group.kind === "approval") {
      if (group.preview.length === 0) continue;
      const pending = groupState(group.steps) === "needs-confirmation";
      cards.push({
        kind: "grouped",
        key: row.key,
        index: row.index,
        table: approvalTable(group),
        metrics: [{ key: "estado", value: approvalMeta(group), tone: pending ? "warning" : "muted" }],
      });
      continue;
    }
    const step = group.steps.find((s) => s.toolCallId === row.key);
    const card = step ? stepCard(step, row.index) : null;
    if (card) cards.push(card);
  }
  return cards;
}

function taskHref(row: StepRow): string | null {
  return typeof row.taskId === "string" ? `/tareas?tarea=${encodeURIComponent(row.taskId)}` : null;
}

function renderCell(columnKey: string, row: StepRow): ReactNode | undefined {
  if (columnKey === "vence" && row.vencida === true) {
    return <span className="font-mono text-destructive">{formatValue(row.vence, "date")}</span>;
  }
  return undefined;
}

function GroupedCard({ card }: { card: Extract<Card, { kind: "grouped" }> }): ReactNode {
  const { table, index } = card;
  const count = stepTableRowCount(table);
  const label = `Paso ${index} · ${table.title}`;
  const flat = table.groups.length === 1 && table.groups[0]?.id === FLAT_GROUP_ID ? table.groups[0] : null;
  const first = table.columns[0]?.key;
  const footer = table.totals && first ? { [first]: `Total · ${formatCount(count)}`, ...table.totals } : undefined;
  const top: Group<StepRow> = {
    id: card.key,
    label,
    caption: filas(count),
    metrics: card.metrics,
    ...(flat ? { rows: flat.rows ?? [] } : { children: table.groups }),
    ...(footer ? { footer } : {}),
  };
  return (
    <GroupedTable<StepRow>
      label={label}
      columns={table.columns}
      groups={[top]}
      heat={table.heat}
      getRowId={(row, i) => (typeof row.id === "string" ? row.id : String(i))}
      rowHref={taskHref}
      renderCell={renderCell}
    />
  );
}

function RecordCard({ card }: { card: Extract<Card, { kind: "record" }> }): ReactNode {
  const label = `Paso ${card.index} · ${card.title}`;
  return (
    <section aria-label={label} className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border px-3 py-2.5">
        <h3 className="text-[13px] font-semibold text-foreground">{label}</h3>
        <span className="font-mono text-[11.5px] text-muted-foreground">{filas(card.data.rows.length)}</span>
      </header>
      <RecordTable data={card.data} density="compacta" />
    </section>
  );
}

export function StepDataPanel({ message }: StepDataPanelProps): ReactNode {
  const { kpis, cards } = useMemo(() => {
    if (!message) return { kpis: [], cards: [] as Card[] };
    const steps = allSteps(toToolSteps(message));
    if (steps.length === 0) return { kpis: [], cards: [] as Card[] };
    return { kpis: stepKpis(steps, message.metadata), cards: cardsOf(message) };
  }, [message]);

  if (kpis.length === 0) {
    return <p className="text-[13px] text-muted-foreground">{DATA_PANEL_EMPTY}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="[&_dl]:grid [&_dl]:grid-cols-2 [&_dl]:gap-2.5">
        <KpiStrip items={kpis} />
      </div>
      {cards.map((card) =>
        card.kind === "grouped" ? <GroupedCard key={card.key} card={card} /> : <RecordCard key={card.key} card={card} />,
      )}
    </div>
  );
}
