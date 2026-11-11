"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Ban, CircleCheck, GripVertical } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { getPersonInitials } from "@/components/ui/TeamMultiSelect";
import {
  boardColumns,
  customStatusesOf,
  flattenBoard,
  groupTasksByColumn,
  type BoardColumn,
} from "@/components/tablero/board-model";
import { useBoardDrag, type BoardCardDragProps } from "@/components/tablero/useBoardDrag";
import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { LIFT_CLASS } from "@/components/widgets/lift";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StyleView } from "@/components/widgets/StyleView";
import { TramoBadge } from "@/components/widgets/TramoBadge";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { areaTintClass } from "@/lib/areas/area-color";
import { actionErrorText } from "@/lib/errors";
import { qk, type TareasListFilters } from "@/lib/query/keys";
import { tareasBoardColumnOptions, type TareasBoardColumnPages } from "@/lib/query/options/tareas";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { useQuickAddRecent } from "@/lib/stores/quick-add-store";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { listItemOfRow } from "@/lib/tareas/page-data";
import { tramoColorSlot, tramoColorVar } from "@/lib/tramos/compat";
import {
  BASE_STATUS_COLOR,
  isTaskClosed,
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
 * - Visual: kanban columns with drag-and-drop, empty columns collapsed to
 *   strips, and a keyboard "Mover a…" menu on every card (frame
 *   `Tareas-Visual`). Cards fade in 40 ms per column + 60 ms per card, lift
 *   on hover, tilt while dragged (`drag-lift`); the column under the card
 *   shows "Suelta aquí" and a dashed placeholder, and a move is announced
 *   ("Movida a …", polite). A drop calls
 *   `onMove`; the move shows through the `board` the page hands back (the
 *   Tareas query cache, patched optimistically and rolled back on error), so
 *   the widget keeps no copy of its own. The columns always render, even
 *   when the filters leave no task: every column then shows its 0 count and a
 *   small "Sin tareas" drop zone, so a card can still be dropped or added.
 *   "+ Agregar" opens the shell's new-task dialog in that column's estatus
 *   (`useNewTaskUi`) for viewers who can create tasks; `renderColumnFooter`
 *   replaces it. With `columnPages`, each column counts every matching task
 *   and loads the rest with "Ver N más" (`tareas.board(f, columnId)`);
 *   with `visibleCards` it first reveals the loaded cards past that many.
 *   `compactCompleted` draws Completado as one line, a blocked card reads
 *   "Bloqueada" with "espera N tareas" (`waitingOn`), `canMove` drops the
 *   drag handle and disables "Mover a…" per card, and a card just created
 *   from a quick-add enters with `row-new`.
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
   * (`pendiente`, …) or `custom:<id>` for a custom status. The page moves
   * the card in the data it hands back; a rejection only shows the error.
   */
  onMove(taskId: string, statusId: string): void | Promise<void>;
  /**
   * The Tareas filters and, per column key, every matching task (`total`)
   * and the cursor after the loaded cards. With it the counts are the totals
   * and a column with more tasks shows "Cargar más".
   */
  columnPages?: BoardColumnPages;
  /**
   * Every configured custom status, so its column shows even with no task in
   * it. Custom statuses found on the tasks are always added.
   */
  customStatuses?: Pick<TaskStatusOption, "id" | "name">[];
  /** Shown by Esencial and Analítico when the board has no tasks; Visual keeps its columns. */
  emptyState?: EmptyStateProps;
  /** Renders the style's loading skeleton instead of the board. */
  loading?: boolean;
  /**
   * Visual: the footer of an open column (e.g. a `QuickAddRow variant="column"`),
   * in place of the "+ Agregar" dialog button.
   */
  renderColumnFooter?(columnKey: string): ReactNode;
  /**
   * Visual: cards an open column shows; "Ver N más" first reveals the rest of
   * the loaded ones, then pages (`columnPages`). Default: every loaded card.
   */
  visibleCards?: number;
  /** Visual: Completado cards as one compact line (check, title, "proyecto · tramo · responsable"). */
  compactCompleted?: boolean;
  /** "Ocultar completadas" (#1039): leaves the Completado column out. */
  hideCompleted?: boolean;
  /**
   * Visual: whether the viewer may move a task. A card it can't move has no
   * drag handle, can't be dragged and its "Mover a…" is disabled. Default: every card.
   */
  canMove?(task: TaskListItem): boolean;
};

export type BoardColumnPages = {
  filters: TareasListFilters;
  columns: Record<string, { total: number; nextCursor: string | null }>;
};

/** Label of a column's load-more button when the remaining count is not known ("Ver N más" otherwise). */
export const BOARD_COLUMN_MORE = "Cargar más";

/**
 * Where a board card opens its task: the current URL (view and every filter)
 * with `tarea=<id>`, the param `TaskSheetRoute` opens the sheet from (same
 * rule as the sheet's `taskSheetHref`), so the board stays as it is under it.
 */
export function boardCardHref(pathname: string, search: string, taskId: string): string {
  const params = new URLSearchParams(search);
  params.set("tarea", taskId);
  return `${pathname}?${params.toString()}`;
}

const DEFAULT_EMPTY: EmptyStateProps = { title: "No hay tareas con estos filtros" };

const PRIORITY_LABEL: Record<TaskPriority, string> = { alta: "Alta", media: "Media", baja: "Baja" };

/** Where Esencial's collapsed Completado group links to. */
const COMPLETED_LIST_HREF = "/tareas?estado=completado";

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
  columnPages,
  customStatuses = NO_CUSTOM_STATUSES,
  emptyState,
  loading,
  renderColumnFooter,
  visibleCards,
  compactCompleted = false,
  hideCompleted = false,
  canMove,
}: TaskBoardWidgetProps) {
  const tasks = useMemo(() => flattenBoard(board), [board]);
  const columns = useMemo(() => {
    const all = boardColumns(mergeCustomStatuses(customStatuses, customStatusesOf(tasks)));
    return hideCompleted ? all.filter((c) => c.key !== "completado") : all;
  }, [customStatuses, tasks, hideCompleted]);

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
        <BoardVisual
          tasks={tasks}
          columns={columns}
          onMove={onMove}
          columnPages={columnPages}
          renderColumnFooter={renderColumnFooter}
          visibleCards={visibleCards}
          compactCompleted={compactCompleted}
          canMove={canMove}
        />
      )}
      esencial={() => empty ?? <BoardEsencial tasks={tasks} columns={columns} table={table} />}
      analitico={() => empty ?? <BoardAnalitico board={board} table={table} />}
    />
  );
}

// ── Visual ─────────────────────────────────────────────────────────────────

/** Accessible name of a board column: "Pendiente, 3 tareas" ("1 tarea"). */
export function boardColumnLabel(label: string, count: number): string {
  return `${label}, ${count} ${count === 1 ? "tarea" : "tareas"}`;
}

/** Live-region text after a move. */
export function boardMovedText(columnLabel: string): string {
  return `Movida a ${columnLabel}`;
}

/** Header hint of the column a card is dragged over. */
export const BOARD_DROP_HINT = "Suelta aquí";

/** Most cards per column that get their own entrance delay. */
const CARD_STAGGER_CAP = 10;

/** Entrance delay of a card: 40 ms per column + 60 ms per card (capped at 10 cards). */
export function boardCardDelay(columnIndex: number, cardIndex: number): string {
  return `${40 * Math.max(0, columnIndex) + 60 * Math.max(0, Math.min(cardIndex, CARD_STAGGER_CAP))}ms`;
}

const DUE_FORMAT = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });

function isoDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

/**
 * Due chip text: "20 nov"; overdue adds the days late, "31 oct · 9 d".
 * Dates are calendar days (`YYYY-MM-DD`), compared in UTC.
 */
export function boardDueText(due: string, overdue: boolean, today: string = todayIso()): string {
  const date = isoDay(due);
  if (Number.isNaN(date.getTime())) return due;
  const text = DUE_FORMAT.format(date).replace(/\./g, "").toLowerCase();
  if (!overdue) return text;
  const days = Math.max(1, Math.round((isoDay(today).getTime() - date.getTime()) / 86_400_000));
  return `${text} · ${days} d`;
}

/** Color of a task's tramo (top strip, subtask fill), neutral without one. */
function tramoColorOf(task: TaskListItem): string {
  return task.workflow ? tramoColorVar(task.workflow.key, task.workflow.sortOrder) : "var(--muted-foreground)";
}

function BoardVisual({
  tasks,
  columns,
  onMove,
  columnPages,
  renderColumnFooter,
  visibleCards,
  compactCompleted,
  canMove,
}: {
  tasks: TaskListItem[];
  columns: BoardColumn[];
  onMove: TaskBoardWidgetProps["onMove"];
  columnPages?: BoardColumnPages;
  renderColumnFooter?: TaskBoardWidgetProps["renderColumnFooter"];
  visibleCards?: number;
  compactCompleted?: boolean;
  canMove?: TaskBoardWidgetProps["canMove"];
}) {
  const grouped = groupTasksByColumn(tasks, columns);
  const today = todayIso();
  const pathname = usePathname() ?? "/tareas";
  const search = useSearchParams()?.toString() ?? "";
  const user = useSessionStore(selectAuthenticatedUser);
  const canCreate = useMemo(() => resolveActivitiesCapabilities(user).canCreateActivity, [user]);
  const openNewTask = useNewTaskUi((s) => s.openNewTask);
  const [announcement, setAnnouncement] = useState("");
  const countOf = (key: string) => columnPages?.columns[key]?.total ?? (grouped[key] ?? []).length;
  const totalCount = columns.reduce((sum, c) => sum + countOf(c.key), 0);
  // With no task at all every column stays open (count 0 and a drop zone) so
  // the board keeps its shape; otherwise empty columns collapse to strips.
  const boardEmpty = tasks.length === 0 && columns.every((c) => countOf(c.key) === 0);

  function move(taskId: string, columnKey: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (task && statusSelectValue(task) === columnKey) return;
    if (task && canMove && !canMove(task)) return;
    const showError = (err: unknown) => toast.error(actionErrorText(err));
    const target = columns.find((c) => c.key === columnKey);
    if (target) setAnnouncement(boardMovedText(target.label));
    try {
      const pending = onMove(taskId, columnKey);
      if (pending) pending.catch(showError);
    } catch (err) {
      showError(err);
    }
  }

  const { draggingTaskId, dragOverKey, cardProps, columnProps } = useBoardDrag<TaskListItem>({
    canDrag: (task) => canMove?.(task) ?? true,
    onDrop: move,
  });
  const draggingTask = draggingTaskId ? tasks.find((t) => t.id === draggingTaskId) : undefined;
  // Columns whose loaded cards are all shown ("Ver N más" pressed once); kept while the board is mounted.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  // Cards just created from a column's quick-add enter with `row-new`.
  const recent = useQuickAddRecent((s) => s.recent);

  const renderCard = (task: TaskListItem, columnIndex: number, cardIndex: number) => (
    <BoardCard
      key={task.id}
      task={task}
      href={boardCardHref(pathname, search, task.id)}
      today={today}
      delay={boardCardDelay(columnIndex, cardIndex)}
      dragging={draggingTaskId === task.id}
      dragProps={cardProps(task)}
      targets={columns.filter((c) => c.key !== statusSelectValue(task))}
      onMoveTo={(key) => move(task.id, key)}
      movable={canMove?.(task) ?? true}
      compact={compactCompleted && statusSelectValue(task) === "completado"}
      isNew={recent.includes(task.id)}
    />
  );

  return (
    <div data-testid="task-board" className="w-full min-w-0 overflow-x-auto pb-2">
      <p aria-live="polite" data-testid="board-announcement" className="sr-only">
        {announcement}
      </p>
      <div className="flex w-full items-start gap-4">
        {columns.map((column, columnIndex) => {
          const inColumn = grouped[column.key] ?? [];
          const count = countOf(column.key);
          const token = columnColor(column, inColumn);
          const colorVar = statusColorVar(token);
          const isDragOver = dragOverKey === column.key;
          const dropTarget = columnProps(column.key);
          const nextCursor = columnPages?.columns[column.key]?.nextCursor ?? null;
          // The dashed placeholder shows where a card from another column lands.
          const landing = isDragOver && !!draggingTask && statusSelectValue(draggingTask) !== column.key;
          const dropClass = isDragOver ? "bg-tint-primary ring-2 ring-ring ring-inset" : "bg-accent";

          if (inColumn.length === 0 && count === 0 && !boardEmpty) {
            return (
              <section
                key={column.key}
                aria-label={boardColumnLabel(column.label, 0)}
                data-collapsed="true"
                data-drop-target={isDragOver || undefined}
                {...dropTarget}
                className={cn(
                  "flex min-h-[360px] w-[52px] shrink-0 flex-col items-center gap-2.5 rounded-lg py-3 text-foreground transition-colors",
                  dropClass,
                )}
              >
                <StatusDot colorVar={colorVar} />
                <span className="font-mono text-xs text-muted-foreground">0</span>
                <span className="text-[13px] font-medium [writing-mode:vertical-rl]">{column.label}</span>
              </section>
            );
          }

          const share = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
          const limit = visibleCards && !expanded.has(column.key) ? visibleCards : inColumn.length;
          const shown = inColumn.slice(0, limit);
          const hiddenLoaded = inColumn.length - shown.length;
          return (
            <section
              key={column.key}
              aria-label={boardColumnLabel(column.label, count)}
              data-drop-target={isDragOver || undefined}
              {...dropTarget}
              className={cn(
                "flex min-w-[250px] flex-1 basis-0 flex-col gap-2.5 rounded-lg p-3 text-foreground transition-colors",
                dropClass,
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <StatusDot colorVar={colorVar} />
                  <h3 className="min-w-0 truncate text-sm font-semibold">{column.label}</h3>
                  <Badge variant="outline" className="bg-card font-mono text-xs">
                    {count}
                  </Badge>
                  {isDragOver ? (
                    <span data-testid="board-drop-hint" className="ml-auto text-[11.5px] text-secondary-foreground">
                      {BOARD_DROP_HINT}
                    </span>
                  ) : null}
                </div>
                <div aria-hidden="true" data-slot="board-column-bar" className="h-1 overflow-hidden rounded-full bg-input">
                  <div className="grow-x h-full rounded-full" style={{ width: `${share}%`, backgroundColor: colorVar }} />
                </div>
              </div>
              {inColumn.length === 0 && !nextCursor && !landing ? (
                <p
                  data-testid="board-column-empty"
                  className={cn(
                    "rounded-[10px] border-2 border-dashed px-3 py-6 text-center text-xs text-muted-foreground transition-colors",
                    isDragOver ? "border-primary" : "border-input",
                  )}
                >
                  {BOARD_COLUMN_EMPTY}
                </p>
              ) : null}
              <ul className="flex flex-col gap-2.5">
                {shown.map((task, i) => renderCard(task, columnIndex, i))}
                {landing ? (
                  <li
                    aria-hidden="true"
                    data-testid="board-drop-placeholder"
                    className="h-16 rounded-[10px] border-2 border-dashed border-primary bg-tint-primary/60"
                  />
                ) : null}
              </ul>
              {hiddenLoaded > 0 ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="self-start text-[12.5px] font-medium"
                  aria-label={`${boardColumnMoreText(count - shown.length)} en ${column.label}`}
                  onClick={() => setExpanded((prev) => new Set(prev).add(column.key))}
                >
                  {boardColumnMoreText(count - shown.length)}
                </Button>
              ) : columnPages && nextCursor ? (
                <BoardColumnMore
                  key={nextCursor}
                  filters={columnPages.filters}
                  column={column}
                  total={count}
                  firstCursor={nextCursor}
                  loadedIds={inColumn.map((t) => t.id)}
                  renderCard={(task, i) => renderCard(task, columnIndex, inColumn.length + i)}
                />
              ) : null}
              {renderColumnFooter ? (
                renderColumnFooter(column.key)
              ) : canCreate ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-start px-2 text-[13px] font-normal text-muted-foreground"
                  aria-label={`Agregar tarea en ${column.label}`}
                  onClick={() => openNewTask({ status: column.key }, "tablero-quick-add")}
                >
                  + Agregar
                </Button>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StatusDot({ colorVar }: { colorVar: string }) {
  return <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorVar }} />;
}

/**
 * The rest of one column, page by page (`tareas.board(f, columnId)`), from
 * the board's cursor. Nothing loads or shows until the first "Ver N más";
 * pages cached from an older cursor (the board reloaded since) are dropped
 * then. A card the board already shows, or one moved to another column, is
 * left out.
 */
function BoardColumnMore({
  filters,
  column,
  total,
  firstCursor,
  loadedIds,
  renderCard,
}: {
  filters: TareasListFilters;
  column: BoardColumn;
  /** Every matching task of the column. */
  total: number;
  firstCursor: string;
  loadedIds: string[];
  renderCard(task: TaskListItem, index: number): ReactNode;
}) {
  const qc = useQueryClient();
  const [requested, setRequested] = useState(false);
  const pages = useInfiniteQuery({
    ...tareasBoardColumnOptions(filters, column.key, firstCursor),
    enabled: requested,
  });
  const loaded = new Set(loadedIds);
  const extra = (requested ? (pages.data?.pages ?? []) : [])
    .flatMap((p) => p.rows)
    .filter((row) => !loaded.has(row.id) && statusSelectValue(row) === column.key)
    .map(listItemOfRow);
  const hasMore = !requested || pages.hasNextPage;
  const busy = pages.isFetching;
  const remaining = total - loadedIds.length - extra.length;
  const label = remaining > 0 ? boardColumnMoreText(remaining) : BOARD_COLUMN_MORE;

  return (
    <>
      {extra.length > 0 ? <ul className="flex flex-col gap-2.5">{extra.map((task, i) => renderCard(task, i))}</ul> : null}
      {hasMore ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start"
          disabled={busy}
          aria-label={`${label} en ${column.label}`}
          onClick={() => {
            if (requested) {
              void pages.fetchNextPage();
              return;
            }
            const key = qk.tareas.board(filters, column.key);
            const cached = qc.getQueryData<TareasBoardColumnPages>(key);
            if (cached && cached.pageParams[0] !== firstCursor) void qc.resetQueries({ queryKey: key, exact: true });
            setRequested(true);
          }}
        >
          {busy ? "Cargando…" : label}
        </Button>
      ) : null}
    </>
  );
}

/** "Ver 27 más" of a column with more tasks than it shows. */
export function boardColumnMoreText(remaining: number): string {
  return `Ver ${remaining} más`;
}

function BoardCard({
  task,
  href,
  today,
  delay,
  dragging,
  dragProps,
  targets,
  onMoveTo,
  movable = true,
  compact = false,
  isNew = false,
}: {
  task: TaskListItem;
  href: string;
  today: string;
  /** Entrance delay (`--anim-delay`). */
  delay: string;
  dragging: boolean;
  dragProps: BoardCardDragProps;
  targets: BoardColumn[];
  onMoveTo(columnKey: string): void;
  /** False: no drag handle and a disabled "Mover a…". */
  movable?: boolean;
  /** Completado as one compact line. */
  compact?: boolean;
  /** Just created from a quick-add: enters with `row-new`. */
  isNew?: boolean;
}) {
  const titleLink = (className: string) => (
    <Link
      href={href}
      scroll={false}
      onNavigate={(e) => {
        // Shallow: the sheet opens from `?tarea=` and the board under it stays as it is.
        e.preventDefault();
        window.history.pushState(null, "", href);
      }}
      className={className}
    >
      {task.title}
    </Link>
  );
  const moveMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!movable}
        className="self-start rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
  );

  if (compact) {
    const meta = [task.project.name, task.workflow?.name, task.manager?.name].filter(Boolean).join(" · ");
    return (
      <li
        {...dragProps}
        data-testid="task-card"
        data-task-id={task.id}
        data-compact=""
        data-dragging={dragging || undefined}
        style={{ "--anim-delay": delay } as CSSProperties}
        className={cn(
          "anim-in flex cursor-grab flex-col gap-1.5 rounded-md border bg-card px-3.5 py-3 text-card-foreground shadow-[var(--shadow-card)] active:cursor-grabbing",
          dragging ? "drag-lift border-primary" : LIFT_CLASS,
          isNew && "row-new",
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <CircleCheck aria-hidden="true" className="mt-px size-4 shrink-0 text-success" />
          <div className="flex min-w-0 flex-col gap-0.5">
            {titleLink("line-clamp-2 text-[13.5px] leading-[1.35] font-medium hover:underline")}
            <p className="truncate text-xs text-muted-foreground">{meta}</p>
          </div>
        </div>
        {moveMenu}
      </li>
    );
  }

  const due = dueDate(task);
  const overdue = isTaskOverdue(task, today);
  const subtasks = task.subtaskCount;
  const subtasksPct = subtasks > 0 ? Math.round((task.subtaskDoneCount / subtasks) * 100) : 0;
  const tramoColor = tramoColorOf(task);
  const tramoSlot = task.workflow ? tramoColorSlot(task.workflow.key) : null;
  const blocked = task.status === "bloqueado";
  const projectLine =
    blocked && task.waitingOn > 0
      ? `${task.project.name} · espera ${task.waitingOn} ${task.waitingOn === 1 ? "tarea" : "tareas"}`
      : task.project.name;

  return (
    <li
      {...dragProps}
      data-testid="task-card"
      data-task-id={task.id}
      data-dragging={dragging || undefined}
      style={{ "--anim-delay": delay } as CSSProperties}
      className={cn(
        "anim-in flex cursor-grab flex-col gap-2.5 overflow-hidden rounded-md border bg-card text-sm text-card-foreground shadow-[var(--shadow-card)] active:cursor-grabbing",
        blocked && "border-tint-destructive",
        dragging ? "drag-lift border-primary" : LIFT_CLASS,
        isNew && "row-new",
      )}
    >
      <span aria-hidden="true" data-slot="board-card-strip" className="h-1 shrink-0" style={{ backgroundColor: tramoColor }} />

      <div className="flex flex-col gap-2 px-3.5 pb-3">
        <div className="flex items-center gap-2">
          {task.workflow ? <TramoBadge tramo={task.workflow} variant="chip" /> : null}
          {blocked ? (
            <span data-slot="board-card-blocked" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-destructive">
              <Ban aria-hidden="true" className="size-3" />
              Bloqueada
            </span>
          ) : task.priority === "alta" ? (
            <span className="text-[11.5px] font-semibold text-destructive">{PRIORITY_LABEL.alta}</span>
          ) : null}
          {movable ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Arrastrar ${task.title}`}
              className="ml-auto inline-flex cursor-grab items-center rounded-sm text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-0.5">
          {titleLink("line-clamp-3 text-sm leading-[1.35] font-semibold hover:underline")}
          <p className="truncate text-[12.5px] text-muted-foreground">{projectLine}</p>
        </div>

        {subtasks > 0 ? (
          <div data-slot="board-card-subtasks" className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
              <span>Subtareas</span>
              <span className="font-mono">
                {task.subtaskDoneCount}/{subtasks}
              </span>
            </div>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="grow-x h-full rounded-full" style={{ width: `${subtasksPct}%`, backgroundColor: tramoColor }} />
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          {task.manager ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold",
                  areaTintClass(tramoSlot),
                )}
              >
                {getPersonInitials(task.manager.name)}
              </span>
              <span className="truncate text-[12.5px] text-foreground-soft">{task.manager.name}</span>
            </span>
          ) : (
            <span className="text-[12.5px] text-muted-foreground">Sin responsable</span>
          )}
          {due ? (
            <Badge
              data-slot="board-card-due"
              variant={overdue ? "destructive" : "outline"}
              className="shrink-0 font-mono text-[11.5px]"
              title={formatDateDMY(due)}
            >
              {boardDueText(due, overdue, today)}
            </Badge>
          ) : null}
        </div>

        {moveMenu}
      </div>
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
