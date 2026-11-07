"use client";

import Link from "next/link";
import { CalendarRange, Flag } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { LoadBar } from "@/components/v2/status/LoadBar";
import { fmtShort, isoDate } from "@/lib/cronograma/week";
import type { RecordTableData } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

import { RecordTable } from "./RecordTable";
import { StyleView } from "./StyleView";
import { WidgetCard } from "./WidgetCard";

/**
 * Cronograma in three styles (redesign FE §3.5, §4.10.2, §15.3; canvas
 * `ProyectoCronograma` + variants). Visual wraps the existing
 * `components/cronograma/*` panels (passed by the page as `panels`) inside a
 * `WidgetCard`, next to the partida timeline and the indicators; Esencial and
 * Analítico render `table` through `RecordTable` (partida, responsable,
 * inicio, fin, duración, % real, % plan, desviación, holgura, monthly text
 * timeline).
 *
 * Row keys read from `table.rows`: `kind` ("partida" | "tarea" | "hito"),
 * `partida`, `responsable`, `inicio` / `fin` (ISO dates), `duracion` (days),
 * `real` / `plan` (0–100; a hito with `real: 100` is reached), `desviacion`
 * (points) and `holgura` (days). The `timeline` column, when present, is
 * derived here. `table.totals` (an object) is the project row.
 */
export type CronogramaWidgetProps = {
  projectId: string;
  table: RecordTableData;
  /** The existing cronograma panels (Gantt, avance, curva S, semanas…) composed by the page; Visual only. */
  panels?: ReactNode;
  emptyState?: EmptyStateProps;
  loading?: boolean;
};

type Kind = "partida" | "tarea" | "hito";

type CronoRow = {
  id: string;
  kind: Kind;
  partida: string;
  responsable: string | null;
  inicio: string | null;
  fin: string | null;
  real: number | null;
  plan: number | null;
  desviacion: number | null;
  holgura: number | null;
};

type Range = { start: Date; end: Date };

type Summary = {
  real: number | null;
  plan: number | null;
  late: CronoRow[];
  hitos: CronoRow[];
  next: CronoRow | null;
  delivery: CronoRow | null;
  deliveryHolgura: number | null;
};

type Indicator = { key: string; label: string; value: string; caption: string; critical?: boolean };

const DEFAULT_EMPTY: EmptyStateProps = {
  icon: CalendarRange,
  title: "Este proyecto todavía no tiene un cronograma importado",
  description: "Importa el cronograma de obra para ver partidas, avance y holguras.",
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toRow(source: Record<string, unknown>, index: number): CronoRow {
  const kind: Kind = source.kind === "tarea" || source.kind === "hito" ? source.kind : "partida";
  return {
    id: text(source.id) ?? String(index),
    kind,
    partida: text(source.partida) ?? "",
    responsable: text(source.responsable),
    inicio: text(source.inicio),
    fin: text(source.fin) ?? text(source.inicio),
    real: num(source.real),
    plan: num(source.plan),
    desviacion: num(source.desviacion),
    holgura: num(source.holgura),
  };
}

function toDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

function fmtDate(iso: string | null): string {
  return iso ? fmtShort(toDate(iso)) : "—";
}

function fmtPct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function totalsObject(totals: RecordTableData["totals"]): Record<string, string | number> | null {
  return totals && typeof totals === "object" ? totals : null;
}

function summarize(rows: CronoRow[], totals: RecordTableData["totals"]): Summary {
  const partidas = rows.filter((r) => r.kind === "partida");
  const project = totalsObject(totals);
  const hitos = rows.filter((r) => r.kind === "hito");
  const delivery = hitos.at(-1) ?? null;
  return {
    real: num(project?.real) ?? mean(partidas.flatMap((r) => (r.real === null ? [] : [r.real]))),
    plan: num(project?.plan) ?? mean(partidas.flatMap((r) => (r.plan === null ? [] : [r.plan]))),
    late: partidas.filter((r) => (r.desviacion ?? 0) < 0),
    hitos,
    next: hitos.find((r) => r.real !== 100) ?? null,
    delivery,
    deliveryHolgura: delivery?.holgura ?? num(project?.holgura),
  };
}

function deviationCaption(real: number | null, plan: number | null): string {
  if (real === null || plan === null) return "Sin plan calculado";
  const diff = Math.round(real - plan);
  const points = (n: number) => `${n} ${n === 1 ? "punto" : "puntos"}`;
  if (diff < 0) return `${points(-diff)} por debajo del plan`;
  if (diff > 0) return `${points(diff)} por encima del plan`;
  return "En línea con el plan";
}

function holguraCaption(holgura: number | null): string {
  if (holgura === null || holgura === 0) return "Según lo pactado en contrato";
  const days = Math.abs(holgura);
  const unit = days === 1 ? "día" : "días";
  return holgura < 0 ? `${days} ${unit} después de lo pactado en contrato` : `${days} ${unit} antes de lo pactado en contrato`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

function indicators(summary: Summary): Indicator[] {
  const list: Indicator[] = [
    {
      key: "avance",
      label: "Avance real vs. plan",
      value: `${fmtPct(summary.real)} / ${fmtPct(summary.plan)}`,
      caption: deviationCaption(summary.real, summary.plan),
    },
    {
      key: "retraso",
      label: "Partidas con retraso",
      value: String(summary.late.length),
      caption: summary.late.length > 0 ? joinNames(summary.late.map((r) => r.partida)) : "Ninguna",
      critical: summary.late.length > 0,
    },
  ];
  if (summary.next) {
    list.push({ key: "hito", label: "Próximo hito", value: fmtDate(summary.next.fin), caption: summary.next.partida });
  }
  if (summary.delivery) {
    list.push({
      key: "entrega",
      label: "Entrega estimada",
      value: fmtDate(summary.delivery.fin),
      caption: holguraCaption(summary.deliveryHolgura),
    });
  }
  return list;
}

/** Project range across the rows and the totals row. */
function projectRange(rows: CronoRow[], totals: RecordTableData["totals"]): Range | null {
  const project = totalsObject(totals);
  const starts = [...rows.map((r) => r.inicio), text(project?.inicio)].filter((v): v is string => v !== null);
  const ends = [...rows.map((r) => r.fin), text(project?.fin)].filter((v): v is string => v !== null);
  if (starts.length === 0 || ends.length === 0) return null;
  const start = toDate(starts.reduce((m, v) => (v < m ? v : m)));
  const end = toDate(ends.reduce((m, v) => (v > m ? v : m)));
  return { start, end: end < start ? start : end };
}

function monthsOf(range: Range): Date[] {
  const months: Date[] = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  while (cursor <= range.end) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function monthLabel(month: Date): string {
  return fmtShort(month).split(" ")[1] ?? "";
}

/** One character per month: "▪" when the row runs in it, "◆" for a hito, "·" otherwise. */
function timelineText(row: CronoRow, months: Date[]): string {
  if (!row.inicio || !row.fin) return "";
  const start = toDate(row.inicio);
  const end = toDate(row.fin);
  return months
    .map((month) => {
      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      if (start > monthEnd || end < month) return "·";
      return row.kind === "hito" ? "◆" : "▪";
    })
    .join("");
}

function rowTitle(row: CronoRow): string {
  return row.kind === "hito" ? `Hito · ${row.partida}` : row.partida;
}

function IndicatorTiles({ items }: { items: Indicator[] }) {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.key} className="flex flex-col gap-1 rounded-lg border border-border p-4">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className={cn("text-2xl font-semibold tabular-nums", item.critical ? "text-destructive" : "text-foreground")}>
            {item.value}
          </dd>
          <dd className="text-xs text-muted-foreground">{item.caption}</dd>
        </div>
      ))}
    </dl>
  );
}

function VisualTimeline({ rows, range }: { rows: CronoRow[]; range: Range }) {
  const totalMs = Math.max(range.end.getTime() - range.start.getTime(), 1);
  const at = (date: Date) => Math.min(Math.max(((date.getTime() - range.start.getTime()) / totalMs) * 100, 0), 100);
  const months = monthsOf(range);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex items-center gap-3 border-b border-border pb-2 text-xs text-muted-foreground">
          <span className="w-56 shrink-0">Partida / tarea</span>
          <span className="relative h-4 flex-1" aria-hidden="true">
            {months.map((month) => (
              <span key={isoDate(month)} className="absolute whitespace-nowrap" style={{ left: `${at(month)}%` }}>
                {monthLabel(month)}
              </span>
            ))}
          </span>
          <span className="w-14 shrink-0 text-right">Avance</span>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const left = row.inicio ? at(toDate(row.inicio)) : 0;
            const width = row.inicio && row.fin ? Math.max(at(toDate(row.fin)) - left, 0.8) : 0;
            const late = (row.desviacion ?? 0) < 0;
            return (
              <li key={row.id} className="flex items-center gap-3 py-2">
                <span className={cn("flex w-56 shrink-0 flex-col", row.kind === "tarea" && "pl-5")}>
                  <span className={cn("truncate text-sm text-foreground", row.kind === "partida" && "font-semibold")}>
                    {rowTitle(row)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {row.kind === "hito" ? fmtDate(row.fin) : `${fmtDate(row.inicio)} – ${fmtDate(row.fin)}`}
                    {row.responsable ? ` · ${row.responsable}` : ""}
                  </span>
                </span>
                <div className="relative h-5 flex-1 rounded bg-muted" aria-hidden="true">
                  {row.kind === "hito" ? (
                    <span
                      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground"
                      style={{ left: `${left}%` }}
                    />
                  ) : (
                    <div className="absolute top-1 bottom-1" style={{ left: `${left}%`, width: `${width}%` }}>
                      <LoadBar
                        className="h-full rounded"
                        tone={late ? "critical" : "default"}
                        segments={[{ percent: row.real ?? 0 }]}
                      />
                    </div>
                  )}
                </div>
                <span className={cn("w-14 shrink-0 text-right text-sm tabular-nums", late ? "text-destructive" : "text-foreground")}>
                  {row.kind === "hito" ? "—" : fmtPct(row.real)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TextRow(props: { title: string; meta?: string; value: string; critical?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-4 border-t border-border py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] text-foreground">{props.title}</span>
        {props.meta ? <span className="text-[13px] text-muted-foreground">{props.meta}</span> : null}
      </span>
      <span className={cn("whitespace-nowrap text-right text-[15px]", props.critical ? "text-destructive" : "text-foreground")}>
        {props.value}
      </span>
    </li>
  );
}

function ReportLink({ projectId }: { projectId: string }) {
  return (
    <Link
      href={`/proyectos/${encodeURIComponent(projectId)}/cronograma/reporte`}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      Ver reporte
    </Link>
  );
}

export function CronogramaWidget({ projectId, table, panels, emptyState, loading }: CronogramaWidgetProps) {
  if (loading) {
    return (
      <StyleView
        visual={() => <LoadingSkeleton variant="list" rows={6} />}
        esencial={() => <LoadingSkeleton variant="list" rows={6} />}
        analitico={() => <LoadingSkeleton variant="table" rows={8} />}
      />
    );
  }

  const rows = table.rows.map(toRow);
  if (rows.length === 0) {
    return (
      <WidgetCard title="Cronograma de obra" icon={CalendarRange}>
        <EmptyState {...(emptyState ?? DEFAULT_EMPTY)} />
      </WidgetCard>
    );
  }

  const summary = summarize(rows, table.totals);
  const tiles = indicators(summary);
  const range = projectRange(rows, table.totals);
  const months = range ? monthsOf(range) : [];

  const scheduleTable: RecordTableData = {
    ...table,
    columns: table.columns.map((column) =>
      column.key === "timeline" && months.length > 0 ? { ...column, label: months.map(monthLabel).join(" · ") } : column,
    ),
  };
  const parsed = new Map(table.rows.map((source, index) => [source, rows[index]]));

  const renderCell = (columnKey: string, source: Record<string, unknown>): ReactNode | undefined => {
    const row = parsed.get(source) ?? toRow(source, 0);
    switch (columnKey) {
      case "partida":
        return row.kind === "partida" ? (
          <span className="font-semibold">{row.partida}</span>
        ) : (
          <span className="pl-4">{rowTitle(row)}</span>
        );
      case "responsable":
        return row.responsable ?? "—";
      case "timeline":
        return <span className="font-mono tracking-widest text-muted-foreground">{timelineText(row, months)}</span>;
      case "real":
      case "plan":
      case "desviacion":
      case "holgura":
        return num(source[columnKey]) === null ? "—" : undefined;
      default:
        return undefined;
    }
  };

  const indicatorTable: RecordTableData = {
    columns: [
      { key: "label", label: "Indicador" },
      { key: "value", label: "Valor", align: "right", mono: true },
      { key: "caption", label: "Detalle" },
    ],
    rows: tiles.map((tile) => ({ id: tile.key, label: tile.label, value: tile.value, caption: tile.caption })),
  };

  return (
    <StyleView
      visual={() => (
        <div className="flex flex-col gap-4">
          <WidgetCard title="Cronograma de obra" icon={CalendarRange} actions={<ReportLink projectId={projectId} />}>
            {range ? <VisualTimeline rows={rows} range={range} /> : null}
          </WidgetCard>
          {panels ? (
            <WidgetCard title="Seguimiento de obra" padded={false}>
              <div className="flex flex-col gap-4">{panels}</div>
            </WidgetCard>
          ) : null}
          <WidgetCard title="Avance del cronograma" icon={Flag}>
            <IndicatorTiles items={tiles} />
          </WidgetCard>
        </div>
      )}
      esencial={() => (
        <div className="flex max-w-[980px] flex-col gap-5">
          <WidgetCard title="Avance del cronograma" actions={<ReportLink projectId={projectId} />}>
            <ul>
              {tiles.map((tile) => (
                <TextRow key={tile.key} title={tile.label} meta={tile.caption} value={tile.value} critical={tile.critical} />
              ))}
            </ul>
          </WidgetCard>
          <WidgetCard title="Partidas">
            <RecordTable data={scheduleTable} renderCell={renderCell} density="comoda" />
          </WidgetCard>
          {summary.hitos.length > 0 ? (
            <WidgetCard title="Hitos">
              <ul>
                {summary.hitos.map((hito) => (
                  <TextRow key={hito.id} title={hito.partida} meta={hito.responsable ?? undefined} value={fmtDate(hito.fin)} />
                ))}
              </ul>
            </WidgetCard>
          ) : null}
        </div>
      )}
      analitico={() => (
        <div className="flex flex-col gap-4">
          <WidgetCard title="Indicadores">
            <RecordTable data={indicatorTable} density="compacta" />
          </WidgetCard>
          <WidgetCard title="Programa de obra" actions={<ReportLink projectId={projectId} />}>
            <RecordTable data={scheduleTable} renderCell={renderCell} density="compacta" />
          </WidgetCard>
        </div>
      )}
    />
  );
}
