"use client";

import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { KpiStrip } from "@/components/widgets/KpiStrip";
import { useCalendarioUi, type CalendarioTile } from "@/lib/stores/calendario-ui-store";
import type { DaySummary, SummaryAction, SummaryItem, SummaryTile, WeekSummary } from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

export type ResumenPanelProps = {
  summary: DaySummary | WeekSummary;
  variant?: "visual" | "esencial" | "analitico";
  onAction?(action: SummaryAction): void;
  /** Opens the Planear mi semana section. When omitted the week button is hidden. */
  onPlanWeek?(): void;
};

const DAY_PRIMARY_LABEL = "✦ Pasa a mañana lo que no alcances hoy";
const WEEK_PRIMARY_LABEL = "✦ Planea mi semana";
const COUNT_TONE: Record<CalendarioTile, boolean> = { reuniones: false, vence: false, riesgo: true, bloqueas: true };

function isWeek(summary: DaySummary | WeekSummary): summary is WeekSummary {
  return "overloadedDays" in summary;
}

function weekdayName(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-MX", { weekday: "long" }).format(parsed);
}

function countClass(tile: SummaryTile): string {
  return COUNT_TONE[tile.key] && tile.count > 0 ? "text-destructive-ink" : "text-foreground";
}

function ItemAction({ item, onAction }: { item: SummaryItem; onAction?(action: SummaryAction): void }) {
  const action = item.action;
  if (!action) return null;
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => onAction?.(action)} aria-label={`${action.label}: ${item.title}`}>
      {action.label}
    </Button>
  );
}

function ItemList({ tile, onAction }: { tile: SummaryTile; onAction?(action: SummaryAction): void }) {
  if (tile.items.length === 0) return <p className="text-sm text-muted-foreground">Nada por aquí.</p>;
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card">
      {tile.items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.line}</p>
          </div>
          <ItemAction item={item} onAction={onAction} />
        </li>
      ))}
    </ul>
  );
}

function PrimaryActions({ summary, onAction, onPlanWeek, large }: Pick<ResumenPanelProps, "summary" | "onAction" | "onPlanWeek"> & { large?: boolean }) {
  const size = large ? "lg" : "default";
  const sizeClass = large ? "h-[54px] w-full text-base" : undefined;
  if (isWeek(summary)) {
    return (
      <div className="flex flex-wrap gap-2">
        {onPlanWeek ? (
          <Button type="button" size={size} className={sizeClass} onClick={onPlanWeek}>
            {WEEK_PRIMARY_LABEL}
          </Button>
        ) : null}
        {summary.overloadedDays.map((day) => (
          <Button
            key={day.date}
            type="button"
            variant="outline"
            size={size}
            className={sizeClass}
            onClick={() => onAction?.({ kind: "redistribute", date: day.date, label: "Reparte esto", tool: "propose_redistribution" })}
          >
            {`✦ Reparte el ${weekdayName(day.date)}`}
          </Button>
        ))}
      </div>
    );
  }
  return (
    <Button type="button" size={size} className={sizeClass} onClick={() => onAction?.(summary.primary)}>
      {DAY_PRIMARY_LABEL}
    </Button>
  );
}

function Header({ summary, onHide }: { summary: DaySummary | WeekSummary; onHide(): void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground">{summary.greeting}</h2>
        <p className="text-sm text-muted-foreground">{summary.lead}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onHide}>
        Ocultar resumen
      </Button>
    </div>
  );
}

export function ResumenPanel({ summary, variant = "visual", onAction, onPlanWeek }: ResumenPanelProps) {
  const collapsed = useCalendarioUi((s) => s.resumenCollapsed);
  const setCollapsed = useCalendarioUi((s) => s.setResumenCollapsed);
  const expanded = useCalendarioUi((s) => s.expandedTile);
  const setExpanded = useCalendarioUi((s) => s.setExpandedTile);
  const baseId = useId();

  if (collapsed) {
    return (
      <section aria-label="Resumen" data-slot="calendario-resumen" data-collapsed="true">
        <Button type="button" variant="ghost" size="sm" onClick={() => setCollapsed(false)}>
          Mostrar resumen
        </Button>
      </section>
    );
  }

  const toggle = (key: CalendarioTile) => setExpanded(expanded === key ? null : key);
  const panelId = (key: CalendarioTile) => `${baseId}-${key}`;
  const openTile = summary.tiles.find((tile) => tile.key === expanded) ?? null;
  const panel: ReactNode = openTile ? (
    <div id={panelId(openTile.key)} role="region" aria-label={openTile.label} className="mt-3">
      <ItemList tile={openTile} onAction={onAction} />
    </div>
  ) : null;

  if (variant === "analitico") {
    const groups = summary.tiles.filter((tile) => tile.items.length > 0);
    return (
      <section aria-label="Resumen" data-slot="calendario-resumen" data-variant="analitico" className="flex flex-col gap-3">
        <Header summary={summary} onHide={() => setCollapsed(true)} />
        <KpiStrip
          items={summary.tiles.map((tile) => ({
            key: tile.key,
            label: tile.label,
            value: tile.count,
            tone: COUNT_TONE[tile.key] && tile.count > 0 ? "destructive" : "default",
          }))}
        />
        {groups.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Elemento</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((tile) => [
                  <TableRow key={`${tile.key}-head`} data-group={tile.key}>
                    <TableCell colSpan={3} className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
                      {`${tile.label} · ${tile.count}`}
                    </TableCell>
                  </TableRow>,
                  ...tile.items.map((item) => (
                    <TableRow key={`${tile.key}-${item.id}`}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell className="text-muted-foreground">{item.line}</TableCell>
                      <TableCell className="text-right">
                        <ItemAction item={item} onAction={onAction} />
                      </TableCell>
                    </TableRow>
                  )),
                ])}
              </TableBody>
            </Table>
          </div>
        ) : null}
        <PrimaryActions summary={summary} onAction={onAction} onPlanWeek={onPlanWeek} />
      </section>
    );
  }

  if (variant === "esencial") {
    return (
      <EsencialCard title={summary.greeting || "Resumen"} padding="md">
        <div data-slot="calendario-resumen" data-variant="esencial" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{summary.lead}</p>
          <div className="flex flex-wrap gap-2">
            {summary.tiles.map((tile) => (
              <Button
                key={tile.key}
                type="button"
                variant={expanded === tile.key ? "secondary" : "outline"}
                size="sm"
                aria-expanded={expanded === tile.key}
                aria-controls={panelId(tile.key)}
                onClick={() => toggle(tile.key)}
              >
                {tile.label}
                <span className={cn("tabular-nums", countClass(tile))}>{tile.count}</span>
              </Button>
            ))}
          </div>
          {panel}
          <PrimaryActions summary={summary} onAction={onAction} onPlanWeek={onPlanWeek} large />
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setCollapsed(true)}>
            Ocultar resumen
          </Button>
        </div>
      </EsencialCard>
    );
  }

  return (
    <section aria-label="Resumen" data-slot="calendario-resumen" data-variant="visual" className="flex flex-col gap-3">
      <Header summary={summary} onHide={() => setCollapsed(true)} />
      <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-4">
        {summary.tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            aria-expanded={expanded === tile.key}
            aria-controls={panelId(tile.key)}
            onClick={() => toggle(tile.key)}
            className={cn(
              "flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-4 py-3 text-left text-card-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              expanded === tile.key && "border-primary",
            )}
          >
            <span className="truncate font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">{tile.label}</span>
            <span className={cn("text-[26px] leading-tight font-semibold tabular-nums", countClass(tile))}>{tile.count}</span>
          </button>
        ))}
      </div>
      {panel}
      <PrimaryActions summary={summary} onAction={onAction} onPlanWeek={onPlanWeek} />
    </section>
  );
}
