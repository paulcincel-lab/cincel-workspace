"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import type { EmptyStateProps } from "@/components/shell/EmptyState";
import { CapacityRing } from "@/components/v2/status/CapacityRing";
import { LoadBar } from "@/components/v2/status/LoadBar";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StyleView } from "@/components/widgets/StyleView";
import { WidgetCard, type WidgetCardProps } from "@/components/widgets/WidgetCard";
import type { ProgressItem, RecordColumn, RecordTableData } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Progress list in three styles (redesign FE §4.10.1, §15.3 "Avance de
 * proyectos"). Reuses `CapacityRing` and `LoadBar` from `components/v2/status`.
 *
 * - Visual: one bar per item (`variant="bars"`, default) or rings of 52–64 px
 *   (`variant="rings"`), filled with the item's `colorVar`.
 * - Esencial: "label … n%" text list, no fills.
 * - Analítico: `RecordTable` with real, plan, desviación (signed, colored
 *   text), presupuesto (only when some item carries `budgetPct`) and próxima
 *   entrega.
 *
 * Widget-level states (FE §4.10.1): `emptyText` / `emptyState` when `items` is
 * empty; `loading` renders the matching `LoadingSkeleton` variant (`list`, or
 * `table` in Analítico).
 */
export type ProgressListWidgetProps = {
  title: string;
  items: ProgressItem[];
  variant?: "bars" | "rings";
  /** Title of the empty state; ignored when `emptyState` is given. */
  emptyText?: string;
  emptyState?: EmptyStateProps;
  loading?: boolean;
  /** Collapse control of the card (`WidgetCard` `collapsible`). */
  collapsible?: WidgetCardProps["collapsible"];
};

export const PROGRESS_LIST_EMPTY_TEXT = "Aún no hay avance que mostrar";

/** Ring diameter in Visual (FE §4.10.1: 52–64 px). */
export const PROGRESS_RING_SIZE = 60;

const NO_VALUE = "—";
const MINUS = "−";

function pct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function optionalPct(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : pct(value);
}

function pctText(value: number | null): string {
  return value === null ? NO_VALUE : `${value}%`;
}

/** Real minus plan in points, from the rounded values every style shows. */
function deviation(item: ProgressItem): number | null {
  const plan = optionalPct(item.plan);
  return plan === null ? null : pct(item.real) - plan;
}

function deviationText(value: number): string {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `${MINUS}${Math.abs(value)}%`;
  return "0%";
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });

/** Lowercase es-MX day and short month for "2026-11-20" or an ISO timestamp; the raw value when unparseable. */
function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date).toLowerCase();
}

const LINK_FOCUS = "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function ItemLabel({ item, className }: { item: ProgressItem; className?: string }) {
  if (!item.href) return <span className={className}>{item.label}</span>;
  return (
    <Link href={item.href} className={cn("hover:underline", LINK_FOCUS, className)}>
      {item.label}
    </Link>
  );
}

function Bars({ items }: { items: ProgressItem[] }) {
  return (
    <ul data-slot="progress-bars" className="flex flex-col gap-3.5">
      {items.map((item) => {
        const value = pct(item.real);
        return (
          <li key={item.id} data-item={item.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <ItemLabel item={item} className="font-medium text-foreground" />
                {item.sublabel ? <span className="text-muted-foreground"> · {item.sublabel}</span> : null}
              </span>
              <span data-value="real" className="shrink-0 font-semibold tabular-nums text-foreground">
                {value}%
              </span>
            </div>
            <div aria-hidden="true">
              <LoadBar segments={[{ percent: value, color: item.colorVar, label: `${item.label}: ${value}%` }]} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Rings({ items }: { items: ProgressItem[] }) {
  return (
    <ul data-slot="progress-rings" className="flex flex-wrap gap-4">
      {items.map((item) => {
        const ring = (
          <CapacityRing
            percent={item.real}
            label={item.label}
            sublabel={item.sublabel}
            size={PROGRESS_RING_SIZE}
            color={item.colorVar}
          />
        );
        return (
          <li key={item.id} data-item={item.id}>
            {item.href ? (
              <Link href={item.href} className={cn("block", LINK_FOCUS)}>
                {ring}
              </Link>
            ) : (
              ring
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TextList({ items }: { items: ProgressItem[] }) {
  return (
    <ul data-slot="progress-list" className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.id}
          data-item={item.id}
          className="flex items-baseline gap-2 border-b py-2 text-[15px] last:border-b-0"
        >
          <span className="min-w-0 truncate">
            <ItemLabel item={item} className="text-foreground" />
            {item.sublabel ? <span className="text-[13px] text-muted-foreground"> · {item.sublabel}</span> : null}
          </span>
          <span aria-hidden="true" className="min-w-4 flex-1 border-b border-dotted border-border" />
          <span data-value="real" className="shrink-0 tabular-nums text-foreground">
            {pct(item.real)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

const LABEL_COLUMN: RecordColumn = { key: "label", label: "Nombre", format: "text" };
const REAL_COLUMN: RecordColumn = { key: "real", label: "Real", align: "right", mono: true, format: "percent" };
const PLAN_COLUMN: RecordColumn = { key: "plan", label: "Plan", align: "right", mono: true, format: "percent" };
const DEVIATION_COLUMN: RecordColumn = {
  key: "deviation",
  label: "Desviación",
  align: "right",
  mono: true,
  format: "delta",
};
const BUDGET_COLUMN: RecordColumn = {
  key: "budget",
  label: "Presupuesto",
  align: "right",
  mono: true,
  format: "percent",
};
const NEXT_COLUMN: RecordColumn = { key: "next", label: "Próxima entrega", format: "text" };

/**
 * The Analítico table: one row per item with the rounded numbers every style
 * shows. "Presupuesto" is present only when some item carries `budgetPct`
 * (the server sends it to budget admins only).
 */
export function progressTableData(items: ProgressItem[]): RecordTableData {
  const withBudget = items.some((item) => item.budgetPct !== null && item.budgetPct !== undefined);
  const columns = withBudget
    ? [LABEL_COLUMN, REAL_COLUMN, PLAN_COLUMN, DEVIATION_COLUMN, BUDGET_COLUMN, NEXT_COLUMN]
    : [LABEL_COLUMN, REAL_COLUMN, PLAN_COLUMN, DEVIATION_COLUMN, NEXT_COLUMN];
  const rows = items.map((item) => ({
    id: item.id,
    label: item.label,
    real: pct(item.real),
    plan: optionalPct(item.plan),
    deviation: deviation(item),
    budget: optionalPct(item.budgetPct),
    next: item.next ? `${item.next.title} · ${formatDate(item.next.date)}` : null,
  }));
  return { columns, rows };
}

function renderTableCell(itemsById: Map<string, ProgressItem>) {
  return function renderProgressCell(columnKey: string, row: Record<string, unknown>): ReactNode | undefined {
    const item = itemsById.get(String(row.id));
    if (!item) return undefined;
    switch (columnKey) {
      case "label":
        return (
          <span>
            <ItemLabel item={item} className="text-foreground" />
            {item.sublabel ? <span className="text-muted-foreground"> · {item.sublabel}</span> : null}
          </span>
        );
      case "real":
        return <span className="font-mono tabular-nums">{pctText(pct(item.real))}</span>;
      case "plan":
        return <span className="font-mono tabular-nums">{pctText(optionalPct(item.plan))}</span>;
      case "deviation": {
        const value = deviation(item);
        if (value === null) return <span className="font-mono text-muted-foreground">{NO_VALUE}</span>;
        return (
          <span
            data-deviation={value < 0 ? "behind" : value > 0 ? "ahead" : "on-plan"}
            className={cn(
              "font-mono tabular-nums",
              value < 0 && "text-destructive",
              value > 0 && "text-success",
              value === 0 && "text-foreground",
            )}
          >
            {deviationText(value)}
          </span>
        );
      }
      case "budget":
        return <span className="font-mono tabular-nums">{pctText(optionalPct(item.budgetPct))}</span>;
      case "next":
        if (!item.next) return <span className="text-muted-foreground">{NO_VALUE}</span>;
        return (
          <span>
            {item.next.title} · <span className="font-mono tabular-nums">{formatDate(item.next.date)}</span>
          </span>
        );
      default:
        return undefined;
    }
  };
}

function AnaliticoTable({ items }: { items: ProgressItem[] }) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return <RecordTable data={progressTableData(items)} renderCell={renderTableCell(itemsById)} density="compacta" />;
}

export function ProgressListWidget({
  title,
  items,
  variant = "bars",
  emptyText,
  emptyState,
  loading = false,
  collapsible,
}: ProgressListWidgetProps) {
  const { style } = useStyle();
  const empty: EmptyStateProps = emptyState ?? { title: emptyText ?? PROGRESS_LIST_EMPTY_TEXT };

  return (
    <WidgetCard
      title={title}
      emptyState={empty}
      loading={loading}
      skeleton={style === "analitico" ? "table" : "list"}
      padded={style !== "analitico"}
      collapsible={collapsible}
    >
      {items.length > 0 ? (
        <StyleView
          visual={() => (variant === "rings" ? <Rings items={items} /> : <Bars items={items} />)}
          esencial={() => <TextList items={items} />}
          analitico={() => <AnaliticoTable items={items} />}
        />
      ) : null}
    </WidgetCard>
  );
}
