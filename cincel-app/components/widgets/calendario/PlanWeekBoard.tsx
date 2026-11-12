"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { StyleView } from "@/components/widgets/StyleView";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { PlanWeekData, Proposal } from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

import { PlanWeekAnalitico } from "./PlanWeekAnalitico";
import { PlanWeekEsencial } from "./PlanWeekEsencial";
import {
  CELL_TONE_LABEL,
  cellAfter,
  cellOf,
  cellTone,
  dayLong,
  daysOf,
  meterLabel,
  movedAnnouncement,
  nextCell,
  placementsOf,
  planSubtitle,
  type PlanPlacement,
} from "./plan-week-model";
import {
  PLAN_SECTION_ID,
  PlanWeekActions,
  PlanWeekBacklog,
  PlanWeekDeferred,
  PlanWeekHeader,
  dayHead,
  type PlanWeekCommon,
} from "./plan-week-parts";

export type PlanWeekBoardProps = Omit<PlanWeekCommon, "picked" | "onPick"> & {
  data: PlanWeekData;
  proposal?: Proposal | null;
  /** Collapsible section of Semana (FE §7.7); expanded unless told otherwise. */
  expanded?: boolean;
  onExpandedChange?(next: boolean): void;
  /** The signed-in person's staff id: Esencial shows only this lane. */
  viewerStaffId?: string | null;
};

const TONE_CLASS = { space: "bg-primary", full: "bg-warning", over: "bg-destructive" } as const;

/** Load meter of one cell: "x/6" and Con espacio / Lleno / Sobrecargado. */
function CellMeter({ hours, workday }: { hours: number; workday: number }) {
  const tone = cellTone(hours, workday);
  const pct = Math.min(100, workday > 0 ? (hours / workday) * 100 : 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-1 text-xs">
        <span className="font-medium tabular-nums">{meterLabel(hours, workday)}</span>
        <span className="text-muted-foreground">{CELL_TONE_LABEL[tone]}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", TONE_CLASS[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PlacementChip({ placement }: { placement: PlanPlacement }) {
  return (
    <li className="truncate rounded-md border border-dashed border-primary bg-muted px-1.5 py-0.5 text-xs" title={placement.title}>
      {placement.title}
    </li>
  );
}

/**
 * Planear mi semana (Phase 7, `P5-Planear`): a collapsible section of Semana
 * in every Estilo. Visual draws the lanes person × Lun–Vie with drag and a
 * keyboard alternative; Esencial the viewer's day cards; Analítico a table.
 * Every path (drag, keyboard, "Mover a…") ends in `onMove`, the one-row
 * `move_tasks` proposal.
 */
export function PlanWeekBoard(props: PlanWeekBoardProps) {
  const { data, proposal = null, checked = [], expanded = true, onExpandedChange, onPlan, viewerStaffId = null } = props;
  const bodyId = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const { placed, unassigned } = useMemo(() => placementsOf(proposal, checked, data.backlog), [proposal, checked, data.backlog]);
  const subtitle = planSubtitle(data);

  const move = (taskId: string, staffId: string, date: string) => {
    const title = data.backlog.find((t) => t.taskId === taskId)?.title ?? "La tarea";
    setPicked(null);
    setAnnouncement(movedAnnouncement(title, date));
    props.onMove?.(taskId, staffId, date);
  };
  const pick = (taskId: string | null) => {
    setPicked(taskId);
    const title = data.backlog.find((t) => t.taskId === taskId)?.title;
    setAnnouncement(
      taskId && title
        ? `Tomaste ${title}. Usa las flechas para elegir persona y día y Enter para soltar. Escape cancela.`
        : "Cancelaste el movimiento.",
    );
  };

  const common: PlanWeekCommon = { ...props, data, proposal, checked, onMove: move, picked, onPick: pick };
  const deferred = proposal?.deferred ?? [];

  return (
    <section
      id={PLAN_SECTION_ID}
      aria-label="Planear la semana"
      className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <PlanWeekHeader
        data={data}
        expanded={expanded}
        busy={props.busy}
        subtitle={expanded ? subtitle : undefined}
        controlsId={bodyId}
        onToggle={onExpandedChange}
        onPlan={() => {
          onExpandedChange?.(true);
          onPlan?.();
        }}
      />
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
      <div id={bodyId} hidden={!expanded} className="flex flex-col gap-3">
        {expanded ? (
          <>
            <StyleView
              visual={() => <PlanWeekLanes {...common} placed={placed} />}
              esencial={() => <PlanWeekEsencial {...common} placed={placed} viewerStaffId={viewerStaffId} />}
              analitico={() => <PlanWeekAnalitico {...common} placed={placed} />}
            />
            <PlanWeekDeferred deferred={[...deferred, ...unassigned.map((u) => ({ taskId: u.taskId, title: u.title, reason: "Sin responsable" }))]} />
            <PlanWeekActions {...props} proposal={proposal} />
          </>
        ) : null}
      </div>
    </section>
  );
}

/** Visual: backlog on the left, lanes person × Lun–Vie on the right. */
function PlanWeekLanes({ data, picked, onPick, onMove, placed }: PlanWeekCommon & { placed: PlanPlacement[] }) {
  const days = daysOf(data);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragging = useCalendarioUi((s) => s.dragging);
  const setDragging = useCalendarioUi((s) => s.setDragging);
  const [overKey, setOverKey] = useState<string | null>(null);

  useEffect(() => {
    if (picked) gridRef.current?.querySelector<HTMLElement>('[data-cell="0-0"]')?.focus();
  }, [picked]);

  function drop(taskId: string | undefined, staffId: string, date: string) {
    setOverKey(null);
    setDragging(null);
    if (taskId) onMove?.(taskId, staffId, date);
  }

  function onCellKey(event: React.KeyboardEvent, row: number, col: number, staffId: string, date: string) {
    if (event.key === "Escape" && picked) {
      event.preventDefault();
      onPick?.(null);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && picked) {
      event.preventDefault();
      drop(picked, staffId, date);
      return;
    }
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const to = nextCell({ row, col }, event.key, data.people.length, days.length);
      gridRef.current?.querySelector<HTMLElement>(`[data-cell="${to.row}-${to.col}"]`)?.focus();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
      <PlanWeekBacklog data={data} picked={picked} onPick={onPick} onMove={onMove} />
      <div className="min-w-0 overflow-x-auto" aria-label="Carga por persona y día">
        <div
          ref={gridRef}
          role="grid"
          aria-label="Persona por día, de lunes a viernes"
          className="grid min-w-[40rem] gap-1.5"
          style={{ gridTemplateColumns: `8rem repeat(${days.length}, minmax(6.5rem, 1fr))` }}
        >
          <div role="row" className="contents">
            <div role="columnheader" className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Persona
            </div>
            {days.map((d) => (
              <div key={d} role="columnheader" className="px-1 text-xs font-semibold text-muted-foreground">
                {dayHead(d)}
              </div>
            ))}
          </div>
          {data.people.map((person, row) => (
            <div key={person.staffId} role="row" className="contents">
              <div role="rowheader" className="flex items-center px-1 text-sm font-medium">
                {person.name}
              </div>
              {days.map((date, col) => {
                const cell = cellOf(data, person.staffId, date);
                const workday = cell?.workday ?? person.workday;
                const absent = person.absent.includes(date);
                const hours = cellAfter(cell, placed, person.staffId, date);
                const chips = placed.filter((p) => p.staffId === person.staffId && p.date === date);
                const key = `${person.staffId}:${date}`;
                const canDrop = !absent && (dragging !== null || picked !== null);
                return (
                  <div
                    key={date}
                    role="gridcell"
                    data-cell={`${row}-${col}`}
                    tabIndex={row === 0 && col === 0 ? 0 : -1}
                    aria-label={`${person.name}, ${dayLong(date)}, ${absent ? "ausente" : `${meterLabel(hours, workday)} horas`}`}
                    onKeyDown={(e) => onCellKey(e, row, col, person.staffId, date)}
                    onDragOver={(e) => {
                      if (absent) return;
                      e.preventDefault();
                      setOverKey(key);
                    }}
                    onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!absent) drop(e.dataTransfer.getData("text/plain") || dragging?.itemId, person.staffId, date);
                    }}
                    onClick={() => {
                      if (picked && !absent) drop(picked, person.staffId, date);
                    }}
                    className={cn(
                      "flex min-h-20 flex-col gap-1.5 rounded-lg border border-border bg-background p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      absent && "bg-muted text-muted-foreground",
                      canDrop && "border-dashed",
                      overKey === key && "border-primary bg-muted",
                    )}
                  >
                    {absent ? (
                      <span className="text-xs">Ausente</span>
                    ) : (
                      <>
                        <CellMeter hours={hours} workday={workday} />
                        {chips.length > 0 ? (
                          <ul className="flex flex-col gap-1">
                            {chips.map((c) => (
                              <PlacementChip key={c.changeId} placement={c} />
                            ))}
                          </ul>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {data.people.length === 0 ? (
            <p className="col-span-full p-3 text-sm text-muted-foreground">No hay personas para planear esta semana.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
