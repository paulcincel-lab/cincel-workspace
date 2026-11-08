"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { Button } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import {
  boardColumns,
  customStatusesOf,
  flattenBoard,
  groupTasksByColumn,
  type BoardColumn,
} from "@/components/tablero/board-model";
import { useBoardDrag, type BoardCardDragProps } from "@/components/tablero/useBoardDrag";
import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StyleView } from "@/components/widgets/StyleView";
import { TramoBadge } from "@/components/widgets/TramoBadge";
import { actionErrorText } from "@/lib/errors";
import {
  BASE_STATUS_COLOR,
  isTaskClosed,
  statusBorderClass,
  statusColorToken,
  statusColorVar,
  statusSelectValue,
  type StatusColorToken,
} from "@/lib/tasks/status-options";
import type { TaskListItem, TaskPriority, TaskStatus, TaskStatusOption } from "@/lib/types/core";
import type { TaskBoard } from "@/lib/types/redesign";
import type { DistributionSegment, RecordTableData } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";
import { formatDateDMY } from "@/lib/utils/date";

/**
 * Task board in three styles (redesign FE §4.10.1). Evolves the `/tablero`
 * board: the columns, grouping and drag-and-drop come from
 * `components/tablero` (shared with `TableroClient`).
 *
 * - Visual: kanban columns with drag-and-drop (optimistic move, rollback and
 *   error toast when `onMove` rejects), empty columns collapsed to strips, and
 *   a keyboard "Mover a…" menu on every card. The columns always render, even
 *   when the filters leave no task: every column then shows its 0 count and a
 *   small "Sin tareas" drop zone, so a card can still be dropped or added.
 * - Esencial: `RecordTable` per estatus ("Pendiente · 4"); Completado
 *   collapsed with a link to the list view.
 * - Analítico: estatus summary (`DistributionWidget`) + dense `RecordTable`.
 */
export type TaskBoardWidgetProps = {
  board: TaskBoard;
  /** One row per task; each row carries the task `id` so Esencial can group it by estatus. */
  table: RecordTableData;
  /**
   * Moves a task to a column. `statusId` is the column key: a base status
   * (`pendiente`, …) or `custom:<id>` for a custom status. Rejecting rolls
   * the move back.
   */
  onMove(taskId: string, statusId: string): Promise<void>;
  /**
   * Visual "+ Agregar" at the end of each open column: called with the column
   * key (same keys as `onMove`) so the page opens a new task in that estatus.
   * Without it the button isn't shown.
   */
  onQuickAdd?(statusId: string): void;
  /**
   * Every configured custom status, so its column shows even with no task in
   * it. Custom statuses found on the tasks are always added.
   */
  customStatuses?: Pick<TaskStatusOption, "id" | "name">[];
  /** Shown by Esencial and Analítico when the board has no tasks; Visual keeps its columns. */
  emptyState?: EmptyStateProps;
  /** Renders the style's loading skeleton instead of the board. */
  loading?: boolean;
};

const DEFAULT_EMPTY: EmptyStateProps = { title: "No hay tareas con estos filtros" };

const PRIORITY_LABEL: Record<TaskPriority, string> = { alta: "Alta", media: "Media", baja: "Baja" };

/** Where Esencial's collapsed Completado group links to. */
const COMPLETED_LIST_HREF = "/tareas?vista=lista&estado=completado";

const NO_MOVES: Record<string, string> = {};

const NO_CUSTOM_STATUSES: Pick<TaskStatusOption, "id" | "name">[] = [];

/** Text of an empty column's drop zone when the whole board is empty. */
export const BOARD_COLUMN_EMPTY = "Sin tareas";

/** The configured custom statuses, then any other custom status the tasks are in. */
function mergeCustomStatuses(
  configured: Pick<TaskStatusOption, "id" | "name">[],
  fromTasks: { id: string; name: string }[],
): { id: string; name: string }[] {
  const seen = new Map<string, { id: string; name: string }>();
  for (const c of [...configured, ...fromTasks]) if (!seen.has(c.id)) seen.set(c.id, { id: c.id, name: c.name });
  return [...seen.values()];
}

/** Local calendar date as `YYYY-MM-DD`. */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dueDate(task: TaskListItem): string | null {
  return task.commitmentDate ?? task.deliveryDate ?? null;
}

/** An open task whose due date is before today. */
export function isTaskOverdue(task: TaskListItem, today: string = todayIso()): boolean {
  const due = dueDate(task);
  return !!due && !isTaskClosed(task) && due.slice(0, 10) < today;
}

/** Color of a column: its base status's, or for a custom status the color of the status underneath. */
function columnColor(column: BoardColumn, tasks: TaskListItem[]): StatusColorToken {
  if (column.key in BASE_STATUS_COLOR) return BASE_STATUS_COLOR[column.key as TaskStatus];
  return tasks[0] ? statusColorToken(tasks[0]) : BASE_STATUS_COLOR.en_proceso;
}

/** Estatus summary segments: one per column, value = tasks, secondary = overdue tasks. */
export function boardSegments(board: TaskBoard, today: string = todayIso()): DistributionSegment[] {
  const tasks = flattenBoard(board);
  const columns = boardColumns(customStatusesOf(tasks));
  const grouped = groupTasksByColumn(tasks, columns);
  return columns.map((c) => {
    const inColumn = grouped[c.key] ?? [];
    return {
      key: c.key,
      label: c.label,
      value: inColumn.length,
      colorVar: statusColorVar(columnColor(c, inColumn)),
      secondary: inColumn.filter((t) => isTaskOverdue(t, today)).length,
    };
  });
}

export function TaskBoardWidget({
  board,
  table,
  onMove,
  onQuickAdd,
  customStatuses = NO_CUSTOM_STATUSES,
  emptyState,
  loading,
}: TaskBoardWidgetProps) {
  const tasks = useMemo(() => flattenBoard(board), [board]);
  const columns = useMemo(
    () => boardColumns(mergeCustomStatuses(customStatuses, customStatusesOf(tasks))),
    [customStatuses, tasks],
  );

  if (loading) {
    return (
      <StyleView
        visual={() => <LoadingSkeleton variant="board" />}
        esencial={() => <LoadingSkeleton variant="list" />}
        analitico={() => <LoadingSkeleton variant="table" />}
      />
    );
  }

  // Visual always shows its columns (a drop target per estatus); the
  // Esencial and Analítico styles have no columns, so they show the empty state.
  const empty = tasks.length === 0 ? <EmptyState {...(emptyState ?? DEFAULT_EMPTY)} /> : null;

  return (
    <StyleView
      visual={() => (
        <BoardVisual board={board} tasks={tasks} columns={columns} onMove={onMove} onQuickAdd={onQuickAdd} />
      )}
      esencial={() => empty ?? <BoardEsencial tasks={tasks} columns={columns} table={table} />}
      analitico={() => empty ?? <BoardAnalitico board={board} table={table} />}
    />
  );
}

// ── Visual ─────────────────────────────────────────────────────────────────

function StatusRing({ token }: { token: StatusColorToken }) {
  return <span aria-hidden className={cn("inline-block size-[18px] shrink-0 rounded-full border-2", statusBorderClass(token))} />;
}

function BoardVisual({
  board,
  tasks,
  columns,
  onMove,
  onQuickAdd,
}: {
  board: TaskBoard;
  tasks: TaskListItem[];
  columns: BoardColumn[];
  onMove: TaskBoardWidgetProps["onMove"];
  onQuickAdd?: TaskBoardWidgetProps["onQuickAdd"];
}) {
  // Optimistic moves, keyed by task, valid for the board they were made on: a
  // new `board` from the page (after the server confirmed) replaces them.
  const [moves, setMoves] = useState<{ board: TaskBoard; byTask: Record<string, string> }>({ board, byTask: {} });
  const byTask = moves.board === board ? moves.byTask : NO_MOVES;
  const columnOf = (t: TaskListItem) => byTask[t.id] ?? statusSelectValue(t);
  const grouped = groupTasksByColumn(tasks, columns, columnOf);
  const today = todayIso();
  // With no task at all every column stays open (count 0 and a drop zone) so
  // the board keeps its shape; otherwise empty columns collapse to strips.
  const boardEmpty = tasks.length === 0;

  async function move(taskId: string, columnKey: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const previous = byTask[taskId];
    if ((previous ?? statusSelectValue(task)) === columnKey) return;

    setMoves((cur) => ({ board, byTask: { ...(cur.board === board ? cur.byTask : {}), [taskId]: columnKey } }));
    try {
      await onMove(taskId, columnKey);
    } catch (err) {
      setMoves((cur) => {
        if (cur.board !== board || cur.byTask[taskId] !== columnKey) return cur;
        const next = { ...cur.byTask };
        if (previous === undefined) delete next[taskId];
        else next[taskId] = previous;
        return { board, byTask: next };
      });
      toast.error(actionErrorText(err));
    }
  }

  const { draggingTaskId, dragOverKey, cardProps, columnProps } = useBoardDrag<TaskListItem>({
    canDrag: () => true,
    onDrop: move,
  });

  return (
    <div data-testid="task-board" className="flex w-full min-w-0 items-start gap-3.5 overflow-x-auto pb-2">
      {columns.map((column) => {
        const inColumn = grouped[column.key] ?? [];
        const token = columnColor(column, inColumn);
        const isDragOver = dragOverKey === column.key;
        const dropTarget = columnProps(column.key);

        if (inColumn.length === 0 && !boardEmpty) {
          return (
            <div
              key={column.key}
              role="group"
              aria-label={`${column.label} · 0`}
              data-collapsed="true"
              {...dropTarget}
              className={cn(
                "flex min-h-[360px] w-[52px] shrink-0 flex-col items-center gap-2.5 rounded-[14px] border bg-muted py-3 text-foreground transition-colors",
                isDragOver ? "border-primary" : "border-transparent",
              )}
            >
              <StatusRing token={token} />
              <span className="font-mono text-xs text-muted-foreground">0</span>
              <span className="text-[13px] font-medium [writing-mode:vertical-rl]">{column.label}</span>
            </div>
          );
        }

        return (
          <div
            key={column.key}
            role="group"
            aria-label={`${column.label} · ${inColumn.length}`}
            {...dropTarget}
            className={cn(
              "flex w-[290px] shrink-0 flex-col gap-2 rounded-[14px] border bg-muted p-2.5 text-foreground transition-colors",
              isDragOver ? "border-primary" : "border-transparent",
            )}
          >
            <div className="flex items-center gap-2 px-1.5 py-1">
              <StatusRing token={token} />
              <h3 className="flex-1 text-[13.5px] font-semibold">{column.label}</h3>
              <span className="font-mono text-xs text-muted-foreground">{inColumn.length}</span>
            </div>
            {inColumn.length === 0 ? (
              <p
                data-testid="board-column-empty"
                className={cn(
                  "rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground transition-colors",
                  isDragOver ? "border-primary" : "border-border",
                )}
              >
                {BOARD_COLUMN_EMPTY}
              </p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {inColumn.map((task) => (
                <BoardCard
                  key={task.id}
                  task={task}
                  today={today}
                  dragging={draggingTaskId === task.id}
                  dragProps={cardProps(task)}
                  targets={columns.filter((c) => c.key !== columnOf(task))}
                  onMoveTo={(key) => void move(task.id, key)}
                />
              ))}
            </ul>
            {onQuickAdd ? (
              <Button
                type="button"
                variant="ghost"
                className="justify-start px-2 text-[13px] font-normal text-muted-foreground"
                aria-label={`Agregar tarea en ${column.label}`}
                onClick={() => onQuickAdd(column.key)}
              >
                + Agregar
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({
  task,
  today,
  dragging,
  dragProps,
  targets,
  onMoveTo,
}: {
  task: TaskListItem;
  today: string;
  dragging: boolean;
  dragProps: BoardCardDragProps;
  targets: BoardColumn[];
  onMoveTo(columnKey: string): void;
}) {
  const due = dueDate(task);
  const overdue = isTaskOverdue(task, today);
  const subtasks = task.subtaskCount;
  const subtasksPct = subtasks > 0 ? Math.round((task.subtaskDoneCount / subtasks) * 100) : 0;

  return (
    <li
      {...dragProps}
      data-testid="task-card"
      data-task-id={task.id}
      className={cn(
        "flex cursor-grab flex-col gap-2 rounded-xl border border-border bg-card p-3 text-sm text-card-foreground shadow-sm transition-opacity active:cursor-grabbing",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {task.workflow ? <TramoBadge tramo={task.workflow} variant="chip" /> : <span />}
        <span className="text-xs text-muted-foreground">{PRIORITY_LABEL[task.priority]}</span>
      </div>

      <div className="min-w-0">
        <Link href={`/tareas?tarea=${task.id}`} className="font-medium hover:underline">
          {task.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{task.project.name}</p>
      </div>

      {subtasks > 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${subtasksPct}%` }} />
          </div>
          <span className="font-mono">
            <span className="sr-only">Subtareas </span>
            {task.subtaskDoneCount}/{subtasks}
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        {task.manager ? (
          <PersonAvatar name={task.manager.name} size="sm" className="min-w-0 text-xs" />
        ) : (
          <span className="text-xs text-muted-foreground">Sin responsable</span>
        )}
        {due ? (
          <span className={cn("font-mono text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
            {formatDateDMY(due)}
          </span>
        ) : null}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="self-start rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Mover a… ${task.title}`}
        >
          Mover a…
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {targets.map((c) => (
            <DropdownMenuItem key={c.key} onClick={() => onMoveTo(c.key)}>
              {c.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

// ── Esencial ───────────────────────────────────────────────────────────────

function BoardEsencial({
  tasks,
  columns,
  table,
}: {
  tasks: TaskListItem[];
  columns: BoardColumn[];
  table: RecordTableData;
}) {
  const grouped = groupTasksByColumn(tasks, columns);
  const columnOfTask = new Map<string, string>();
  for (const [key, inColumn] of Object.entries(grouped)) for (const t of inColumn) columnOfTask.set(t.id, key);

  return (
    <div data-testid="task-board-esencial" className="flex flex-col gap-6">
      {columns
        .filter((c) => (grouped[c.key] ?? []).length > 0)
        .map((c) => {
          const count = grouped[c.key].length;
          const headingId = `task-board-group-${c.key.replace(/[^a-z0-9_-]/gi, "-")}`;
          const rows = table.rows.filter((r) => columnOfTask.get(String(r.id)) === c.key);
          return (
            <section key={c.key} aria-labelledby={headingId} className="flex flex-col gap-2">
              <h3 id={headingId} className="text-sm font-semibold">
                {c.label} · {count}
              </h3>
              {c.key === "completado" ? (
                <Link href={COMPLETED_LIST_HREF} className="text-sm text-muted-foreground underline underline-offset-4">
                  Ver completadas en la lista
                </Link>
              ) : (
                <RecordTable data={{ ...table, groupBy: undefined, totals: undefined, heat: undefined, rows }} />
              )}
            </section>
          );
        })}
    </div>
  );
}

// ── Analítico ──────────────────────────────────────────────────────────────

function BoardAnalitico({ board, table }: { board: TaskBoard; table: RecordTableData }) {
  const segments = useMemo(() => boardSegments(board), [board]);
  return (
    <div data-testid="task-board-analitico" className="flex flex-col gap-4">
      <DistributionWidget title="Tareas por estatus" segments={segments} totalLabel="Total" secondaryLabel="Vencidas" />
      <RecordTable data={{ ...table, totals: table.totals ?? "auto" }} density="compacta" />
    </div>
  );
}
