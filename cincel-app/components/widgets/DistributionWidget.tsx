"use client";

import type { ReactNode } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import type { ChartConfig } from "@/components/ui/shadcn/chart";
import { LazyDonutChart } from "@/components/widgets/charts/lazy";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StyleView } from "@/components/widgets/StyleView";
import { WidgetCard, type WidgetCardProps } from "@/components/widgets/WidgetCard";
import type { WidgetView } from "@/lib/stores/dashboard-store";
import type { DistributionSegment, RecordColumn, RecordTableData } from "@/lib/types/widgets";

/**
 * Distribution in three styles (redesign FE §4.10.1, §15.3 "Tareas por tramo"):
 *
 * - Visual: donut + legend on `components/ui/shadcn/chart.tsx` (replaces
 *   the old dashboard donut).
 * - Esencial: text list "label … value".
 * - Analítico: `RecordTable` with the value, `secondary`, `% secondary/value`
 *   heat cell (> 45 % warning, > 60 % destructive, FE §15.2), the
 *   `extraColumns` and a total row. Without `secondary` the % column is the
 *   share of the total.
 *
 * Widget-level states: `emptyText` is shown when there are no segments or the
 * total is 0; `loading` renders the `LoadingSkeleton` variant of the style.
 *
 * `view` (dashboards, optional): "chart" renders the Visual donut and
 * "table" the Analítico table whatever the style; omitted, the style decides.
 */
export type DistributionWidgetProps = {
  title: string;
  segments: DistributionSegment[];
  /** What `value` counts (Analítico column header, word under the donut total). */
  totalLabel?: string;
  /** What `secondary` counts (Analítico column header). */
  secondaryLabel?: string;
  extraColumns?: { key: string; label: string }[];
  /** Empty-state title. */
  emptyText?: string;
  /** Renders the skeleton instead of the data. */
  loading?: boolean;
  /** Dashboard override: "chart" = the Visual donut, "table" = the Analítico table. */
  view?: WidgetView;
  /** Card header controls (`WidgetCard` `actions`), e.g. a chart / table picker. */
  actions?: ReactNode;
  /** Collapse control of the card (`WidgetCard` `collapsible`). */
  collapsible?: WidgetCardProps["collapsible"];
};

export const DISTRIBUTION_EMPTY_TEXT = "Sin datos para mostrar";
const DEFAULT_TOTAL_LABEL = "Total";
const DEFAULT_SECONDARY_LABEL = "Secundario";
const LABEL_COLUMN = "Categoría";

/** Heat thresholds on `secondary / value` in % (FE §15.2). */
export const DISTRIBUTION_HEAT = { warnAt: 45, critAt: 60 } as const;

/** Donut on a 200px box: ring 28px thick, 2px gap between segments. */
const SIZE = 200;
const RING = 28;
const GAP = 2;

/** Rounded percentage of `part` in `whole`; null when `whole` is 0. */
export function percentOf(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

function sumValues(segments: DistributionSegment[]): number {
  return segments.reduce((sum, s) => sum + s.value, 0);
}

function extraKey(key: string): string {
  return `extra:${key}`;
}

/** Builds the Analítico table (pure; exported for tests and assistant adapters). */
export function distributionTable({
  segments,
  totalLabel,
  secondaryLabel,
  extraColumns = [],
}: Pick<DistributionWidgetProps, "segments" | "totalLabel" | "secondaryLabel" | "extraColumns">): RecordTableData {
  const total = sumValues(segments);
  const hasSecondary = segments.some((s) => typeof s.secondary === "number");
  const secondaryTotal = segments.reduce((sum, s) => sum + (s.secondary ?? 0), 0);
  const secondaryName = secondaryLabel ?? DEFAULT_SECONDARY_LABEL;

  const columns: RecordColumn[] = [
    { key: "label", label: LABEL_COLUMN, format: "text" },
    { key: "value", label: totalLabel ?? DEFAULT_TOTAL_LABEL, align: "right", mono: true, format: "count" },
  ];
  if (hasSecondary) {
    columns.push(
      { key: "secondary", label: secondaryName, align: "right", mono: true, format: "count" },
      { key: "ratio", label: `% ${secondaryName.toLowerCase()}`, align: "right", mono: true, format: "percent" },
    );
  } else {
    columns.push({ key: "share", label: "%", align: "right", mono: true, format: "percent" });
  }
  for (const extra of extraColumns) {
    const numeric = segments.every((s) => {
      const v = s.extra?.[extra.key];
      return v === undefined || typeof v === "number";
    });
    columns.push({
      key: extraKey(extra.key),
      label: extra.label,
      ...(numeric ? { align: "right" as const, mono: true } : {}),
      format: "text",
    });
  }

  const rows = segments.map((s) => {
    const row: Record<string, unknown> = {
      id: s.key,
      label: s.label,
      colorVar: s.colorVar,
      value: s.value,
    };
    if (hasSecondary) {
      row.secondary = s.secondary ?? 0;
      row.ratio = percentOf(s.secondary ?? 0, s.value);
    } else {
      row.share = percentOf(s.value, total);
    }
    for (const extra of extraColumns) {
      const v = s.extra?.[extra.key];
      if (v !== undefined) row[extraKey(extra.key)] = v;
    }
    return row;
  });

  const totals: Record<string, string | number> = { label: "Total", value: total };
  if (hasSecondary) {
    totals.secondary = secondaryTotal;
    const ratio = percentOf(secondaryTotal, total);
    if (ratio !== null) totals.ratio = ratio;
  } else if (total > 0) {
    totals.share = 100;
  }

  return {
    columns,
    rows,
    totals,
    ...(hasSecondary ? { heat: [{ key: "ratio", ...DISTRIBUTION_HEAT }] } : {}),
  };
}

/** Accessible summary of the donut ("Tareas por tramo: Presale 9 (18%), …; abiertas 51"). */
export function distributionSummary(title: string, segments: DistributionSegment[], totalLabel?: string): string {
  const total = sumValues(segments);
  const parts = segments.map((s) => `${s.label} ${s.value} (${percentOf(s.value, total) ?? 0}%)`);
  return `${title}: ${parts.join(", ")}; ${(totalLabel ?? DEFAULT_TOTAL_LABEL).toLowerCase()} ${total}`;
}

function VisualDistribution({ title, segments, totalLabel }: DistributionWidgetProps) {
  const total = sumValues(segments);
  const visible = segments.filter((s) => s.value > 0);
  const config = Object.fromEntries(
    segments.map((s) => [s.key, { label: s.label, color: s.colorVar }]),
  ) satisfies ChartConfig;

  return (
    <div data-slot="distribution-visual" className="flex flex-col items-center gap-6 sm:flex-row">
      <div
        role="img"
        aria-label={distributionSummary(title, segments, totalLabel)}
        className="relative shrink-0"
        style={{ width: SIZE, height: SIZE }}
      >
        <LazyDonutChart
          config={config}
          data={visible.map((s) => ({ key: s.key, value: s.value, fill: s.colorVar }))}
          innerRadius={SIZE / 2 - RING}
          outerRadius={SIZE / 2}
          gap={visible.length > 1 ? GAP : 0}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span data-slot="distribution-total" className="text-3xl font-semibold tabular-nums">
            {total}
          </span>
          <span className="text-xs text-muted-foreground">{(totalLabel ?? DEFAULT_TOTAL_LABEL).toLowerCase()}</span>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2 text-sm">
        {segments.map((s) => (
          <li key={s.key} data-segment={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.colorVar }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span data-slot="distribution-value" className="font-mono tabular-nums">
              {s.value}
            </span>
            <span data-slot="distribution-share" className="w-10 text-right font-mono tabular-nums text-muted-foreground">
              {percentOf(s.value, total) ?? 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EsencialDistribution({ segments }: DistributionWidgetProps) {
  return (
    <ul data-slot="distribution-esencial" className="flex flex-col">
      {segments.map((s) => (
        <li
          key={s.key}
          data-segment={s.key}
          className="flex items-center justify-between gap-4 border-t py-2 text-[15px] first:border-t-0"
        >
          <span className="min-w-0 truncate">{s.label}</span>
          <span data-slot="distribution-value" className="tabular-nums">
            {s.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AnaliticoDistribution(props: DistributionWidgetProps) {
  const data = distributionTable(props);
  return (
    <div data-slot="distribution-analitico">
      <RecordTable
        data={data}
        density="compacta"
        renderCell={(columnKey, row) => {
          if (columnKey !== "label") return undefined;
          return (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: String(row.colorVar ?? "") }}
              />
              {String(row.label ?? "")}
            </span>
          );
        }}
      />
    </div>
  );
}

export function DistributionWidget(props: DistributionWidgetProps) {
  const { style } = useStyle();
  const { title, segments, emptyText, loading = false, view, actions, collapsible } = props;
  const empty = segments.length === 0 || sumValues(segments) <= 0;
  const tableShown = view ? view === "table" : style === "analitico";

  return (
    <WidgetCard
      title={title}
      padded={!tableShown}
      loading={loading}
      skeleton={tableShown ? "table" : "list"}
      emptyState={{ title: emptyText ?? DISTRIBUTION_EMPTY_TEXT }}
      actions={actions}
      collapsible={collapsible}
    >
      {empty ? null : (
        <StyleView
          view={view}
          visual={() => <VisualDistribution {...props} />}
          esencial={() => <EsencialDistribution {...props} />}
          analitico={() => <AnaliticoDistribution {...props} />}
        />
      )}
    </WidgetCard>
  );
}
