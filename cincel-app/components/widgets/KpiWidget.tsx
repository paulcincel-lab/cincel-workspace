"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { useStyle } from "@/components/shell/StyleProvider";
import { DELTA_TEXT, formatKpiDelta, KpiRow, type KpiTileProps } from "@/components/v2/layout/KpiRow";
import { RecordTable } from "@/components/widgets/RecordTable";
import { hasSparklineData, Sparkline } from "@/components/widgets/Sparkline";
import { StyleView } from "@/components/widgets/StyleView";
import { etapaColorVar, etapaLabel } from "@/lib/etapas/compat";
import type { WidgetView } from "@/lib/stores/dashboard-store";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { KpiDatum, RecordTableData } from "@/lib/types/widgets";
import { staggerStyle } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

/**
 * KPIs in three styles (redesign FE §4.10.1, §15.3 "Indicadores"); filters
 * `visibleIn` by the current style. Extends `components/v2/layout/KpiRow` /
 * `KpiTile`.
 *
 * - Visual: tiles with label and delta chip (`delta.label` / `delta.tone`:
 *   "+4 vs. semana", "sin cambio"), value, full-width sparkline (`series7`,
 *   hidden without data), etapa split bar and context line (`caption`).
 *   Tiles fade in 40 ms apart (`anim-in`) and the sparkline draws in.
 * - Esencial: one card of big numbers + labels; no charts, no tints.
 * - Analítico: `RecordTable` rows: Indicador, Hoy, Δ 7 días, Prom. 30 días,
 *   Mín – máx 30 d, Tendencia 7 d.
 *
 * Dashboard extras (zustand.md §2.5), all optional: `view` picks the tiles
 * ("chart", Visual) or the table ("table", Analítico) whatever the style;
 * with `onSelect` each KPI is a toggle button (`aria-pressed` when it is
 * `selectedKey`) instead of a link.
 */
export type KpiWidgetProps = {
  items: KpiDatum[];
  /** Shown when no item is visible in the current style. */
  emptyState?: EmptyStateProps;
  /** Renders the matching `LoadingSkeleton` variant instead of the data. */
  loading?: boolean;
  /** Dashboard override: "chart" = the Visual tiles, "table" = the Analítico table. */
  view?: WidgetView;
  /** The selected KPI key (`aria-pressed`), with `onSelect`. */
  selectedKey?: string | null;
  /** Makes each KPI a toggle button; called with its key. */
  onSelect?(key: string): void;
};

/** KPI selection passed down to the style branches. */
type Selection = Pick<KpiWidgetProps, "selectedKey" | "onSelect">;

const SELECT_BUTTON_CLASS =
  "text-left underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none aria-pressed:font-semibold aria-pressed:text-foreground";

function SelectButton({
  item,
  selectedKey,
  onSelect,
}: {
  item: KpiDatum;
  selectedKey?: string | null;
  onSelect(key: string): void;
}) {
  return (
    <button
      type="button"
      data-slot="kpi-select"
      aria-pressed={selectedKey === item.key}
      onClick={() => onSelect(item.key)}
      className={SELECT_BUTTON_CLASS}
    >
      {item.label}
    </button>
  );
}

export const KPI_EMPTY_STATE: EmptyStateProps = {
  icon: BarChart3,
  title: "Sin indicadores",
  description: "Aún no hay datos para mostrar.",
};

const DASH = "—";

const numberFormat = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

export function formatKpiNumber(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? DASH : numberFormat.format(value);
}

/** The headline number of a KPI: `display` when the server formatted it. */
export function kpiValueText(item: KpiDatum): string {
  return item.display ?? formatKpiNumber(item.value);
}

/** Items shown in a style; `visibleIn` omitted = every style. */
export function visibleKpis(items: KpiDatum[], style: PresentationStyle): KpiDatum[] {
  return items.filter((item) => !item.visibleIn || item.visibleIn.includes(style));
}

function toTile(item: KpiDatum, { selectedKey, onSelect }: Selection = {}): KpiTileProps {
  return {
    ...(onSelect ? { pressed: selectedKey === item.key, onToggle: () => onSelect(item.key) } : {}),
    id: item.key,
    size: "lg",
    label: item.label,
    value: kpiValueText(item),
    series7: item.series7,
    delta: item.delta,
    split: item.split?.map((s) => ({
      key: s.etapa,
      label: etapaLabel(s.etapa),
      share: s.share,
      colorVar: etapaColorVar(s.etapa),
    })),
    caption: item.caption,
    href: item.href,
  };
}

function Visual({ items, ...selection }: { items: KpiDatum[] } & Selection) {
  return (
    <div data-style="visual" data-slot="kpi-widget">
      <KpiRow
        spacing="widget"
        tiles={items.map((item, i) => ({ ...toTile(item, selection), className: "anim-in", style: staggerStyle(i, 40) }))}
      />
    </div>
  );
}

function Esencial({ items, selectedKey, onSelect }: { items: KpiDatum[] } & Selection) {
  return (
    <div data-style="esencial" data-slot="kpi-widget" className="rounded-lg border border-border bg-card p-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} data-slot="kpi-item" className="flex flex-col-reverse gap-1">
            <dt className="text-[13px] text-muted-foreground">
              {onSelect ? (
                <SelectButton item={item} selectedKey={selectedKey} onSelect={onSelect} />
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              ) : (
                item.label
              )}
            </dt>
            <dd data-slot="kpi-value" className="text-[30px] leading-none font-medium text-foreground tabular-nums">
              {kpiValueText(item)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const ANALITICO_COLUMNS: RecordTableData["columns"] = [
  { key: "indicador", label: "Indicador", format: "text" },
  { key: "hoy", label: "Hoy", align: "right", mono: true, format: "text" },
  { key: "delta", label: "Δ 7 días", align: "right", mono: true, format: "text" },
  { key: "avg30", label: "Prom. 30 días", align: "right", mono: true, format: "text" },
  { key: "range30", label: "Mín – máx 30 d", align: "right", mono: true, format: "text" },
  { key: "tendencia", label: "Tendencia 7 d", align: "right", format: "text" },
];

/** The Analítico table: one row per KPI, cells already formatted as text. */
export function kpiTableData(items: KpiDatum[]): RecordTableData {
  return {
    columns: ANALITICO_COLUMNS,
    rows: items.map((item) => ({
      id: item.key,
      indicador: item.label,
      hoy: kpiValueText(item),
      delta: item.delta ? formatKpiDelta(item.delta.value) : DASH,
      avg30: formatKpiNumber(item.avg30),
      range30:
        item.min30 === undefined && item.max30 === undefined
          ? DASH
          : `${formatKpiNumber(item.min30)} – ${formatKpiNumber(item.max30)}`,
      tendencia: hasSparklineData(item.series7) ? item.series7.join(", ") : DASH,
    })),
  };
}

function Analitico({ items, selectedKey, onSelect }: { items: KpiDatum[] } & Selection) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  return (
    <div
      data-style="analitico"
      data-slot="kpi-widget"
      className="overflow-hidden rounded-[10px] border border-border bg-card text-[12.5px]"
    >
      <RecordTable
        data={kpiTableData(items)}
        density="compacta"
        renderCell={(columnKey, row) => {
          const item = byKey.get(String(row.id));
          if (!item) return undefined;
          if (columnKey === "indicador") {
            if (onSelect) return <SelectButton item={item} selectedKey={selectedKey} onSelect={onSelect} />;
            return item.href ? (
              <Link href={item.href} className="underline-offset-4 hover:underline">
                {item.label}
              </Link>
            ) : undefined;
          }
          if (columnKey === "delta" && item.delta) {
            return (
              <span
                data-good={item.delta.good}
                className={cn(
                  "block text-right font-mono tabular-nums",
                  // The 7-day change: zero reads neutral, else colored by `good`.
                  DELTA_TEXT[item.delta.value === 0 ? "neutral" : item.delta.good ? "good" : "bad"]
                )}
              >
                {formatKpiDelta(item.delta.value)}
                <span className="sr-only">{` ${item.delta.caption}`}</span>
              </span>
            );
          }
          if (columnKey === "tendencia" && hasSparklineData(item.series7)) {
            return (
              <Sparkline
                points={item.series7}
                label={`Tendencia 7 días de ${item.label}: ${item.series7.join(", ")}`}
                className="ml-auto block"
              />
            );
          }
          if (columnKey === "hoy" || columnKey === "delta" || columnKey === "avg30" || columnKey === "range30") {
            return <span className="block text-right font-mono tabular-nums">{String(row[columnKey])}</span>;
          }
          return undefined;
        }}
      />
    </div>
  );
}

function skeletonRows(count: number, max: number): number {
  return Math.max(1, Math.min(max, count || 4));
}

export function KpiWidget({ items, emptyState, loading = false, view, selectedKey, onSelect }: KpiWidgetProps) {
  const { style } = useStyle();
  const selection: Selection = { selectedKey, onSelect };
  if (loading) {
    return (
      <StyleView
        view={view}
        visual={() => <LoadingSkeleton variant="kpis" rows={skeletonRows(items.length, 4)} />}
        esencial={() => <LoadingSkeleton variant="kpis" rows={skeletonRows(items.length, 4)} />}
        analitico={() => <LoadingSkeleton variant="table" rows={skeletonRows(items.length, 12)} />}
      />
    );
  }
  const shown = visibleKpis(items, style);
  if (shown.length === 0) return <EmptyState {...(emptyState ?? KPI_EMPTY_STATE)} />;
  return (
    <StyleView
      view={view}
      visual={() => <Visual items={shown} {...selection} />}
      esencial={() => <Esencial items={shown} {...selection} />}
      analitico={() => <Analitico items={shown} {...selection} />}
    />
  );
}
