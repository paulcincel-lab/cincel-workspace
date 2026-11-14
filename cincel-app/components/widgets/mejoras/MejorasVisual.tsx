"use client";

import { Loader2 } from "lucide-react";
import { useState, type DragEvent, type KeyboardEvent } from "react";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { Button } from "@/components/ui/shadcn/button";
import {
  GithubChip,
  KindChip,
  PriorityChip,
  TicketAvatar,
  type MejorasViewProps,
} from "@/components/widgets/mejoras/mejoras-parts";
import { useMejorasRows, useTriage } from "@/components/widgets/mejoras/use-triage";
import { timeAgo } from "@/lib/my-space/my-tasks";
import { BOARD_FILTERS, BOARD_STATUSES, changesRow, groupByStatus } from "@/lib/soporte/mejoras-triage";
import { AREA_LABEL, STATUS_LABEL, type TicketListRow, type TicketStatus } from "@/lib/types/soporte";
import { cn } from "@/lib/utils";

export type { MejorasViewProps } from "@/components/widgets/mejoras/mejoras-parts";

export const BOARD_LABEL = "Solicitudes por estado";
export const BOARD_HINT = "Arrastra una tarjeta a otra columna para cambiar su estado, o usa Alt con las flechas izquierda y derecha.";
export const COLUMN_EMPTY_TEXT = "Sin solicitudes.";
const DRAG_TYPE = "application/x-cincel-solicitud";

/** The column `delta` steps from `status` along the flow, or null at the ends. */
export function neighborStatus(status: TicketStatus, delta: -1 | 1): TicketStatus | null {
  const index = (BOARD_STATUSES as readonly TicketStatus[]).indexOf(status);
  if (index < 0) return null;
  return BOARD_STATUSES[index + delta] ?? null;
}

function TicketCard({
  row,
  now,
  onOpen,
  onMove,
}: {
  row: TicketListRow;
  now: Date;
  onOpen(code: string): void;
  onMove(row: TicketListRow, status: TicketStatus): void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const target = neighborStatus(row.status, event.key === "ArrowLeft" ? -1 : 1);
    event.preventDefault();
    if (target) onMove(row, target);
  };
  const onDragStart = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(DRAG_TYPE, row.id);
    event.dataTransfer.effectAllowed = "move";
  };
  return (
    <li
      draggable
      onDragStart={onDragStart}
      data-slot="mejoras-card"
      data-ticket={row.code}
      className="flex cursor-grab flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground active:cursor-grabbing"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-[.08em] text-muted-foreground">{row.code}</span>
        <PriorityChip priority={row.priority} />
      </div>
      <button
        type="button"
        onClick={() => onOpen(row.code)}
        onKeyDown={onKeyDown}
        aria-describedby="mejoras-board-hint"
        className="text-left text-sm font-medium text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {row.title}
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        <KindChip kind={row.kind} />
        <span className="text-xs text-muted-foreground">{AREA_LABEL[row.area]}</span>
        <GithubChip row={row} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <TicketAvatar person={row.author} />
          <span className="truncate">{row.author.name}</span>
        </span>
        <time dateTime={row.createdAt} className="shrink-0">
          {timeAgo(row.createdAt, now)}
        </time>
      </div>
    </li>
  );
}

/**
 * Mejoras, Visual style (frame `Mejoras-Visual`): a board by status (Nuevo,
 * En revisión, Planeado, En progreso, Resuelto) with a card per solicitud.
 * Dragging a card to another column changes its status (Deshacer in the
 * toast); with the keyboard, Alt + ← / → on the card title does the same.
 * The board always shows every solicitud, whatever the table filters are.
 */
export function MejorasVisual({ onOpen }: MejorasViewProps) {
  const { rows, isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useMejorasRows(BOARD_FILTERS);
  const { apply } = useTriage();
  const [now] = useState(() => new Date());
  const [over, setOver] = useState<TicketStatus | null>(null);

  if (error && rows.length === 0) throw error;
  if (isPending) return <LoadingSkeleton variant="board" />;

  const groups = groupByStatus(rows);
  const move = (row: TicketListRow, status: TicketStatus) => {
    if (!changesRow(row, { status })) return;
    void apply([{ id: row.id, patch: { status } }]);
  };
  const onDrop = (event: DragEvent<HTMLElement>, status: TicketStatus) => {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const row = rows.find((candidate) => candidate.id === id);
    if (row) move(row, status);
  };

  return (
    <div className="flex flex-col gap-3">
      <p id="mejoras-board-hint" className="sr-only">
        {BOARD_HINT}
      </p>
      <div role="group" aria-label={BOARD_LABEL} className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {BOARD_STATUSES.map((status) => {
          const cards = groups[status];
          return (
            <section
              key={status}
              aria-labelledby={`mejoras-col-${status}`}
              data-status={status}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
                event.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((current) => (current === status ? null : current))}
              onDrop={(event) => onDrop(event, status)}
              className={cn("flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2", over === status && "ring-2 ring-ring")}
            >
              <h2 id={`mejoras-col-${status}`} className="flex items-center justify-between px-1 text-sm font-semibold">
                {STATUS_LABEL[status]}
                <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{cards.length}</span>
              </h2>
              {cards.length === 0 ? (
                <p className="px-1 py-3 text-xs text-muted-foreground">{COLUMN_EMPTY_TEXT}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cards.map((row) => (
                    <TicketCard key={row.id} row={row} now={now} onOpen={onOpen} onMove={move} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {hasNextPage ? (
        <Button type="button" variant="outline" className="self-center" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          Cargar más
        </Button>
      ) : null}
    </div>
  );
}
