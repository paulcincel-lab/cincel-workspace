"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import { useStyle } from "@/components/shell/StyleProvider";
import { Badge } from "@/components/ui/shadcn/badge";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StyleView } from "@/components/widgets/StyleView";
import { TramoBadge } from "@/components/widgets/TramoBadge";
import { WidgetCard, type WidgetCardProps } from "@/components/widgets/WidgetCard";
import { tramoColorVar, tramoLabel } from "@/lib/tramos/compat";
import type { WorkflowRef } from "@/lib/types/core";
import type { AttentionItem, RecordTableData, Tone, TramoKey } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * "Requiere atención" list in three styles (redesign FE §4.10.1, §15).
 *
 * - Visual: rows with a 4 px tramo bar, title link, "proyecto · tramo", reason
 *   pill, avatar and due date (mono, `destructive` when late).
 * - Esencial: title + "proyecto · persona · motivo fecha" as plain text.
 * - Analítico: `RecordTable` (Tarea, Proyecto, Tramo dot, Resp. initials,
 *   Motivo, Vence, Retraso).
 *
 * `totalCount` / `moreHref` render the "Ver más" affordance in the card header.
 * Widget-level states: `emptyText` / `emptyState` when there are no items,
 * `loading` for the `LoadingSkeleton` variant (list, or table in Analítico).
 */
export type AttentionListWidgetProps = {
  title: string;
  items: AttentionItem[];
  totalCount?: number;
  moreHref?: string;
  /** Line shown when `items` is empty (FE §3.1). */
  emptyText?: string;
  /** Full empty state; overrides `emptyText`. */
  emptyState?: EmptyStateProps;
  loading?: boolean;
  /** Collapse control of the card (`WidgetCard` `collapsible`). */
  collapsible?: WidgetCardProps["collapsible"];
};

export const ATTENTION_EMPTY_TEXT = "Nada requiere atención hoy";
export const ATTENTION_MORE_LABEL = "Ver más";
export const ATTENTION_NO_ASSIGNEE = "Sin responsable";
const NO_VALUE = "—";

const DUE_FORMAT = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-02" → "2 nov" (es-MX, lowercase, FE §13). Null or unparseable → "—". */
export function formatAttentionDue(due: string | null): string {
  if (!due) return NO_VALUE;
  const date = new Date(DATE_ONLY.test(due) ? `${due}T00:00:00Z` : due);
  if (Number.isNaN(date.getTime())) return NO_VALUE;
  return DUE_FORMAT.format(date).replace(/\.$/, "").toLowerCase();
}

/** "5 d" for late items, "—" otherwise. */
export function formatAttentionLate(daysLate: number | null): string {
  return daysLate !== null && daysLate > 0 ? `${daysLate} d` : NO_VALUE;
}

function isLate(item: AttentionItem): boolean {
  return item.daysLate !== null && item.daysLate > 0;
}

function tramoRef(key: TramoKey): WorkflowRef {
  return { id: key, key, name: tramoLabel(key), sortOrder: 0 };
}

/** Card tone: the most severe tone among the items. */
function cardTone(items: AttentionItem[]): Tone {
  if (items.some((i) => i.tone === "critical")) return "critical";
  if (items.some((i) => i.tone === "warn")) return "warn";
  return "default";
}

/** Reason pill per tone (tints FE §14.5); the label is always shown. */
function ReasonPill({ reason, tone }: { reason: string; tone: Tone }) {
  if (tone === "critical") return <Badge variant="destructive">{reason}</Badge>;
  if (tone === "warn") {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-[color-mix(in_oklab,var(--warning)_22%,var(--card))] text-(--warning-ink)"
      >
        {reason}
      </Badge>
    );
  }
  if (tone === "ok") {
    return (
      <Badge variant="outline" className="border-transparent bg-success/15 text-success">
        {reason}
      </Badge>
    );
  }
  return <Badge variant="secondary">{reason}</Badge>;
}

function DueDate({ item, className }: { item: AttentionItem; className?: string }) {
  return (
    <time
      data-slot="attention-due"
      dateTime={item.due ?? undefined}
      className={cn(isLate(item) ? "text-destructive" : "text-muted-foreground", className)}
    >
      {formatAttentionDue(item.due)}
    </time>
  );
}

function VisualRows({ items }: { items: AttentionItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          data-slot="attention-row"
          className="flex items-center gap-3 rounded-lg border border-l-4 bg-card py-2 pr-3 pl-3"
          style={{ borderLeftColor: item.tramo ? tramoColorVar(item.tramo) : "var(--border)" }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Link href={item.href} className="truncate text-sm font-medium text-foreground hover:underline">
              {item.title}
            </Link>
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{item.project}</span>
              {item.tramo ? (
                <>
                  <span aria-hidden="true">·</span>
                  <TramoBadge tramo={tramoRef(item.tramo)} variant="text" />
                </>
              ) : null}
            </span>
          </div>
          <ReasonPill reason={item.reason} tone={item.tone} />
          {item.assignee ? (
            <PersonAvatar name={item.assignee.name} initials={item.assignee.initials} hideName />
          ) : (
            <span className="sr-only">{ATTENTION_NO_ASSIGNEE}</span>
          )}
          <DueDate item={item} className="w-14 shrink-0 text-right font-mono text-xs" />
        </li>
      ))}
    </ul>
  );
}

function EsencialRows({ items }: { items: AttentionItem[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {items.map((item) => (
        <li key={item.id} data-slot="attention-row" className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
          <Link href={item.href} className="text-[15px] text-foreground hover:underline">
            {item.title}
          </Link>
          <span data-slot="attention-meta" className="text-[13px] text-muted-foreground">
            {item.project} · {item.assignee?.name ?? ATTENTION_NO_ASSIGNEE} · {item.reason}
            {item.due ? (
              <>
                {" "}
                <DueDate item={item} />
              </>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

const ANALITICO_COLUMNS: RecordTableData["columns"] = [
  { key: "title", label: "Tarea" },
  { key: "project", label: "Proyecto" },
  { key: "tramo", label: "Etapa" },
  { key: "assignee", label: "Resp." },
  { key: "reason", label: "Motivo" },
  { key: "due", label: "Vence", mono: true, format: "date" },
  { key: "daysLate", label: "Retraso", align: "right", mono: true, format: "days" },
];

function AnaliticoTable({ items }: { items: AttentionItem[] }) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const data: RecordTableData = {
    columns: ANALITICO_COLUMNS,
    rows: items.map((item) => ({
      id: item.id,
      title: item.title,
      project: item.project,
      tramo: item.tramo,
      assignee: item.assignee?.initials ?? null,
      reason: item.reason,
      due: item.due,
      daysLate: item.daysLate,
    })),
  };

  const renderCell = (key: string, row: Record<string, unknown>): ReactNode | undefined => {
    const item = byId.get(String(row.id));
    if (!item) return undefined;
    switch (key) {
      case "title":
        return (
          <Link href={item.href} className="text-foreground hover:underline">
            {item.title}
          </Link>
        );
      case "tramo":
        return item.tramo ? <TramoBadge tramo={tramoRef(item.tramo)} variant="dot" /> : NO_VALUE;
      case "assignee":
        return item.assignee ? (
          <abbr title={item.assignee.name} className="font-mono no-underline">
            {item.assignee.initials}
          </abbr>
        ) : (
          <span title={ATTENTION_NO_ASSIGNEE}>{NO_VALUE}</span>
        );
      case "due":
        return <DueDate item={item} className="font-mono" />;
      case "daysLate":
        return (
          <span
            data-slot="attention-late"
            className={cn("block text-right font-mono", isLate(item) ? "text-destructive" : "text-muted-foreground")}
          >
            {formatAttentionLate(item.daysLate)}
          </span>
        );
      default:
        return undefined;
    }
  };

  return <RecordTable data={data} renderCell={renderCell} density="compacta" />;
}

function MoreLink({ shown, totalCount, moreHref }: { shown: number; totalCount?: number; moreHref?: string }) {
  const hasMore = totalCount !== undefined && totalCount > shown;
  if (moreHref) {
    return (
      <Link href={moreHref} data-slot="attention-more" className="text-primary hover:underline">
        {hasMore ? `${ATTENTION_MORE_LABEL} (${totalCount})` : ATTENTION_MORE_LABEL}
      </Link>
    );
  }
  return (
    <span data-slot="attention-more" className="text-muted-foreground">
      {shown} de {totalCount}
    </span>
  );
}

export function AttentionListWidget({
  title,
  items,
  totalCount,
  moreHref,
  emptyText = ATTENTION_EMPTY_TEXT,
  emptyState,
  loading = false,
  collapsible,
}: AttentionListWidgetProps) {
  const { style } = useStyle();
  const showMore = Boolean(moreHref) || (totalCount !== undefined && totalCount > items.length);

  return (
    <WidgetCard
      title={title}
      icon={CircleAlert}
      tone={cardTone(items)}
      actions={showMore ? <MoreLink shown={items.length} totalCount={totalCount} moreHref={moreHref} /> : undefined}
      loading={loading}
      skeleton={style === "analitico" ? "table" : "list"}
      padded={style !== "analitico"}
      emptyState={emptyState ?? { title: emptyText }}
      collapsible={collapsible}
    >
      {items.length > 0 ? (
        <StyleView
          visual={() => <VisualRows items={items} />}
          esencial={() => <EsencialRows items={items} />}
          analitico={() => <AnaliticoTable items={items} />}
        />
      ) : null}
    </WidgetCard>
  );
}
