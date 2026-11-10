"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";

import type { BoardCard, BoardColumn, TramoTone } from "@/components/proyectos/projects-portfolio-data";
import { useBoardDrag } from "@/components/tablero/useBoardDrag";
import { cn } from "@/lib/utils";

/**
 * "Tablero del portafolio" of /proyectos in Visual (#992): one column per
 * tramo (a leading "Sin tramo" one when some project has none), one card per
 * project linking to it (tramo left border, real progress bar, open and
 * overdue counts). With `canMove`, a card can be dragged to another column
 * with the pointer (`useBoardDrag`) or the keyboard: Space picks it up, ←/→
 * choose the column, Space drops it, Esc cancels. Every step is announced in
 * a polite live region (`announcement`, set by the caller after a move, plus
 * the pick-up and cancel messages from here). Dropping on the card's own
 * column, or on a column that is not `droppable`, does nothing. Without
 * `canMove` the cards are plain links (no handle, not draggable).
 */
export type PortfolioBoardWidgetProps = {
  columns: BoardColumn[];
  /** The tone of a column key (`tramoTone`). */
  toneOf(key: string): TramoTone;
  canMove: boolean;
  /** A card dropped on another droppable column. */
  onMove?(card: BoardCard, from: BoardColumn, to: BoardColumn): void;
  /** Rendered at the end of the last column (e.g. the "Nuevo proyecto" ghost button). */
  lastColumnFooter?: ReactNode;
  /** The latest message for the live region (e.g. "Casa Lomas movido a Diseño"). */
  announcement?: string;
  /** The caller's live message changes (pick-up, cancel). */
  onAnnounce?(message: string): void;
};

export const EMPTY_COLUMN_TEXT = "Sin proyectos";
export const MOVE_CANCELLED_TEXT = "Movimiento cancelado";
export const MOVE_HINT_TEXT = "Pulsa Espacio para mover el proyecto de tramo.";

type Picked = { id: string; from: string; over: string };

function overdueText(n: number): string {
  return n === 1 ? "1 vencida" : `${n} vencidas`;
}

function CardBody({ card, tone, canMove }: { card: BoardCard; tone: TramoTone; canMove: boolean }) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={card.name}>
          {card.name}
        </span>
        {canMove ? (
          <GripVertical data-slot="drag-handle" aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
      </div>
      <span className="truncate text-xs text-muted-foreground" title={card.subtitle}>
        {card.subtitle}
      </span>
      <div
        role="img"
        aria-label={`Avance ${card.real} %`}
        className="h-1.5 overflow-hidden rounded-full"
        style={{ background: tone.soft }}
      >
        <div className="grow-x h-full rounded-full" style={{ width: `${card.real}%`, background: tone.color }} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono tabular-nums text-muted-foreground">
          {card.open} {card.open === 1 ? "abierta" : "abiertas"}
        </span>
        {card.overdue > 0 ? (
          <span className="font-mono tabular-nums text-destructive">{overdueText(card.overdue)}</span>
        ) : (
          <span className="text-success">Al día</span>
        )}
      </div>
    </>
  );
}

export function PortfolioBoardWidget({
  columns,
  toneOf,
  canMove,
  onMove,
  lastColumnFooter,
  announcement = "",
  onAnnounce,
}: PortfolioBoardWidgetProps) {
  const hintId = useId();
  const [picked, setPicked] = useState<Picked | null>(null);
  // A keyboard drop remounts the card in its new column: focus follows it there.
  const refocusId = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = refocusId.current;
    if (!id) return;
    const card = rootRef.current?.querySelector<HTMLElement>(`[data-project="${id}"]`);
    if (card && card !== document.activeElement) card.focus();
    refocusId.current = null;
  }, [picked, columns]);
  const columnOfCard = (id: string) => columns.find((c) => c.cards.some((card) => card.id === id)) ?? null;
  const droppable = columns.filter((c) => c.droppable);

  function drop(cardId: string, toKey: string) {
    const from = columnOfCard(cardId);
    const to = columns.find((c) => c.key === toKey);
    const card = from?.cards.find((c) => c.id === cardId);
    if (!from || !to || !card || !to.droppable || to.key === from.key) return false;
    onMove?.(card, from, to);
    return true;
  }

  const drag = useBoardDrag<BoardCard>({
    canDrag: () => canMove,
    onDrop: (cardId, key) => {
      drop(cardId, key);
    },
  });

  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>, card: BoardCard, column: BoardColumn) {
    if (!canMove) return;
    const current = picked?.id === card.id ? picked : null;
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      if (!current) {
        setPicked({ id: card.id, from: column.key, over: column.key });
        onAnnounce?.(`${card.name} seleccionado. Usa las flechas para elegir el tramo y Espacio para soltarlo.`);
        return;
      }
      setPicked(null);
      if (current.over === current.from || !drop(card.id, current.over)) onAnnounce?.(MOVE_CANCELLED_TEXT);
      else refocusId.current = card.id;
      return;
    }
    if (!current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setPicked(null);
      onAnnounce?.(MOVE_CANCELLED_TEXT);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (droppable.length === 0) return;
      const index = droppable.findIndex((c) => c.key === current.over);
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next =
        index < 0
          ? droppable[step > 0 ? 0 : droppable.length - 1]
          : droppable[Math.min(droppable.length - 1, Math.max(0, index + step))];
      setPicked({ ...current, over: next.key });
      onAnnounce?.(next.label);
    }
  }

  return (
    <div ref={rootRef} data-slot="portfolio-board">
      {canMove ? (
        <span id={hintId} className="sr-only">
          {MOVE_HINT_TEXT}
        </span>
      ) : null}
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {columns.map((column, columnIndex) => {
          const tone = toneOf(column.key);
          const isTarget =
            (picked !== null && picked.over === column.key && picked.from !== column.key) ||
            (drag.draggingTaskId !== null && drag.dragOverKey === column.key);
          const last = columnIndex === columns.length - 1;
          return (
            <div
              key={column.key}
              data-slot="board-column"
              data-column={column.key}
              data-drop-target={isTarget ? "true" : undefined}
              className={cn(
                "flex min-w-0 flex-col gap-2.5 rounded-[14px] bg-accent p-3",
                isTarget && "outline-2 outline-offset-2 outline-ring",
              )}
              {...(canMove && column.droppable ? drag.columnProps(column.key) : {})}
            >
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: tone.color }} />
                <span className="min-w-0 flex-1 truncate">{column.label}</span>
                <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
                  <span className="sr-only">Proyectos: </span>
                  {column.cards.length}
                </span>
              </h3>
              {column.cards.length === 0 ? (
                <p className="text-xs text-muted-foreground">{EMPTY_COLUMN_TEXT}</p>
              ) : (
                <ul aria-label={column.label} className="flex flex-col gap-2.5">
                  {column.cards.map((card, cardIndex) => {
                    const dragProps = drag.cardProps(card);
                    const isPicked = picked?.id === card.id;
                    return (
                      <li key={card.id}>
                        <Link
                          href={`/proyectos/${card.id}`}
                          data-slot="board-card"
                          data-project={card.id}
                          aria-describedby={canMove ? hintId : undefined}
                          draggable={dragProps.draggable}
                          onDragStart={(event: DragEvent<HTMLAnchorElement>) => {
                            if (!dragProps.draggable) {
                              event.preventDefault();
                              return;
                            }
                            event.dataTransfer?.setData("text/plain", card.id);
                            dragProps.onDragStart();
                          }}
                          onDragEnd={dragProps.onDragEnd}
                          onKeyDown={(event) => handleKeyDown(event, card, column)}
                          onBlur={() => {
                            if (isPicked) {
                              setPicked(null);
                              onAnnounce?.(MOVE_CANCELLED_TEXT);
                            }
                          }}
                          className={cn(
                            "anim-in lift flex min-w-0 flex-col gap-2 rounded-[10px] border border-l-4 bg-card p-3.5 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            (isPicked || drag.draggingTaskId === card.id) && "drag-lift",
                          )}
                          style={
                            {
                              borderLeftColor: tone.color,
                              "--anim-delay": `${Math.min(columnIndex * 40 + cardIndex * 60, 600)}ms`,
                            } as CSSProperties
                          }
                        >
                          <CardBody card={card} tone={tone} canMove={canMove} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {last ? lastColumnFooter : null}
            </div>
          );
        })}
      </div>
      <div aria-live="polite" role="status" className="sr-only" data-slot="board-announcer">
        {announcement}
      </div>
    </div>
  );
}
