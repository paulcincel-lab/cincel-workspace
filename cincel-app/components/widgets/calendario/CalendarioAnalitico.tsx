"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import { CalendarX } from "lucide-react";

import { replaceCalendarioUrl } from "@/components/calendario/use-calendario-page";
import { TaskBulkBar } from "@/components/tareas/TaskBulkBar";
import { TAREAS_CELL_KEYS, useTaskCellEdits } from "@/components/tareas/use-task-cell-edits";
import { deleteTargetOf, useDeleteTasks } from "@/components/tareas/use-delete-tasks";
import { useTaskSelection } from "@/components/tareas/use-task-selection";
import type { TaskBulkTask } from "@/components/tareas/task-bulk";
import { Button } from "@/components/ui/shadcn/button";
import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { KpiStrip, type KpiStripItem } from "@/components/widgets/KpiStrip";
import { TramoBadge } from "@/components/widgets/TramoBadge";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import {
  buildGroups,
  kpiItems,
  peopleOf,
  rangeCaption,
  remainingOf,
  rowsOfGroup,
  shortDate,
  timeOf,
  type AnaliticoOrder,
} from "@/lib/calendario/analitico";
import { DEFAULT_CALENDARIO_FILTERS, normalizeCalendarioFilters } from "@/lib/calendario/url-state";
import { qk } from "@/lib/query/keys";
import { calendarioListInfiniteOptions } from "@/lib/query/options/calendario";
import { catalogStaffOptions, catalogTramosOptions } from "@/lib/query/options/catalog";
import type { CalItem, CalTaskItem, CalTramoRef, CalendarioListPage, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";
import type { StaffRef, WorkflowRef } from "@/lib/types/core";
import type { RecordColumn } from "@/lib/types/widgets";

export type CalendarioAnaliticoProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  /** Pages already loaded (the first page prefetched on the server). */
  list?: InfiniteData<CalendarioListPage, string | null>;
  onOpen?(id: string): void;
};

type AnaliticoRow = Record<string, unknown> & { id: string; item: CalItem };

const NO_ITEMS: CalItem[] = [];
const NO_STAFF: StaffRef[] = [];
const NO_TRAMOS: WorkflowRef[] = [];
const TABLE_LABEL = "Tareas y reuniones del rango";
const ERROR_TITLE = "No se pudo cargar el calendario.";
const EMPTY_TITLE = "No hay tareas ni reuniones en este rango.";
const CLEAR_FILTERS = "Quitar filtros";
const LOCK_MEETING = "Las reuniones se editan desde su detalle.";
const LOCK_TASK = "No puedes cambiar esta tarea.";

/** The columns of the table (FE §4.3). FECHA sorts on the server (`orderDir`). */
const COLUMNS: RecordColumn<AnaliticoRow>[] = [
  { key: "fecha", label: "FECHA", mono: true, width: 100 },
  { key: "hora", label: "HORA", mono: true, width: 90 },
  { key: "tipo", label: "TIPO", width: 90 },
  { key: "titulo", label: "TÍTULO", width: 280 },
  { key: "proyecto", label: "PROYECTO", width: 170 },
  { key: "tramo", label: "TRAMO", width: 130 },
  { key: "responsable", label: "RESPONSABLE / ASISTENTES", width: 200 },
];

const toRow = (item: CalItem): AnaliticoRow => ({ id: item.id, item });

function workflowOf(tramo: CalTramoRef | null): WorkflowRef | null {
  return tramo ? { id: tramo.id, key: tramo.key ?? "", name: tramo.name, sortOrder: 0, colorSlot: tramo.colorSlot } : null;
}

/** A task item as the task-table kit reads a task (the cells, the bulk bar and the delete flow). */
function taskOfItem(item: CalTaskItem): TaskBulkTask {
  return {
    id: item.taskId,
    projectId: item.project?.id ?? "",
    kind: item.tramo ? "workflow" : "usuario",
    title: item.title,
    workflowId: item.tramo?.id ?? null,
    workflow: workflowOf(item.tramo),
    phaseId: item.phase?.id ?? null,
    phase: null,
    spaceId: null,
    space: null,
    status: item.status,
    customStatus: null,
    managerId: item.manager?.id ?? null,
    manager: item.manager,
    support: item.support,
    priority: item.priority,
    commitmentDate: item.dateField === "commitmentDate" ? item.date : null,
    reviewDate: null,
    deliveryDate: item.dateField === "deliveryDate" ? item.date : null,
    parentTaskId: item.parentTaskId,
  };
}

const taskOfRow = (row: AnaliticoRow): TaskBulkTask | undefined => (row.item.kind === "task" ? taskOfItem(row.item) : undefined);

/** Analítico layout of /calendario (FE §4.3): KPI strip and a table grouped by hour, day or week. */
export function CalendarioAnalitico({ range, query, list, onOpen }: CalendarioAnaliticoProps): ReactNode {
  const [order, setOrder] = useState<AnaliticoOrder>("asc");
  const filters = useMemo(() => normalizeCalendarioFilters(query.filters), [query.filters]);

  // ── Rows: the cursor pages of the whole range; "Cargar más" asks for the next one.
  const rowsQuery = useInfiniteQuery({
    ...calendarioListInfiniteOptions({ from: range.from, to: range.to, filters, orderDir: order }),
    ...(list && order === "asc" ? { initialData: list } : {}),
  });
  const loaded = useMemo(() => (rowsQuery.data ? rowsQuery.data.pages.flatMap((page) => page.rows) : NO_ITEMS), [rowsQuery.data]);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = rowsQuery;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Catalogs of the editors.
  const staff = useQuery(catalogStaffOptions()).data ?? NO_STAFF;
  const tramos = useQuery(catalogTramosOptions()).data ?? NO_TRAMOS;
  const cells = useTaskCellEdits<AnaliticoRow>({ taskOf: taskOfRow, tramos, staff });
  const deletes = useDeleteTasks({ invalidate: [qk.calendario.all] });

  // ── Groups: headers and counts from `days`, rows by date.
  const models = useMemo(() => buildGroups(query.vista, range.days, order, range.today), [query.vista, range.days, order, range.today]);
  const rowsPending = rowsQuery.isPending;
  const hidden = deletes.hiddenIds;
  const groups = useMemo<Group<AnaliticoRow>[]>(
    () =>
      models.map((model) => {
        const rows = rowsOfGroup(model, loaded)
          .filter((item) => item.kind === "event" || !(hidden.has(item.taskId) || (item.parentTaskId !== null && hidden.has(item.parentTaskId))))
          .map(toRow);
        const remaining = remainingOf(model, rows.length);
        return {
          id: model.id,
          label: model.label,
          caption: model.caption,
          metrics: [],
          rows: rowsPending ? undefined : rows,
          hidden: model.count === 0 && rows.length === 0,
          hasMore: !rowsPending && remaining > 0 && hasNextPage,
          remaining,
        };
      }),
    [models, loaded, rowsPending, hasNextPage, hidden],
  );

  // ── Selection: task rows only, in table order.
  const visibleIds = useMemo(
    () => groups.flatMap((group) => (group.rows ?? []).filter((row) => row.item.kind === "task").map((row) => row.id)),
    [groups],
  );
  const selection = useTaskSelection({ visibleIds, resetKey: JSON.stringify([filters, range.from, range.to, order]) });
  const taskOfId = useCallback(
    (id: string): TaskBulkTask | undefined => {
      const item = loaded.find((candidate) => candidate.id === id);
      return item?.kind === "task" ? taskOfItem(item) : undefined;
    },
    [loaded],
  );

  // ── Columns: Fecha and Responsable edit in place on task rows.
  const columns = useMemo(() => {
    const fecha = cells.cell("vence");
    const responsable = cells.cell("responsable");
    const lockOf = (base: (row: AnaliticoRow) => true | string) => (row: AnaliticoRow): true | string => {
      if (row.item.kind === "event") return LOCK_MEETING;
      return row.item.canEdit ? base(row) : LOCK_TASK;
    };
    return COLUMNS.map((column): RecordColumn<AnaliticoRow> => {
      if (column.key === "fecha") return { ...column, edit: fecha.edit, canEdit: lockOf(fecha.canEdit) };
      if (column.key === "responsable") return { ...column, edit: responsable.edit, canEdit: lockOf(responsable.canEdit) };
      return column;
    });
  }, [cells]);

  const open = useCallback(
    (id: string) => {
      if (onOpen) onOpen(id);
      else replaceCalendarioUrl({ ...query, evento: id });
    },
    [onOpen, query],
  );

  const renderCell = useCallback(
    (key: string, row: AnaliticoRow): ReactNode | undefined => {
      const item = row.item;
      switch (key) {
        case "fecha":
          return shortDate(item.date);
        case "hora":
          return timeOf(item);
        case "tipo":
          return item.kind === "task" ? "Tarea" : "Reunión";
        case "titulo":
          return (
            <Button type="button" variant="link" size="sm" className="h-auto max-w-[280px] justify-start truncate p-0" onClick={() => open(item.id)}>
              {item.title}
            </Button>
          );
        case "proyecto":
          return item.project?.name ?? "—";
        case "tramo":
          return <TramoBadge tramo={workflowOf(item.tramo)} variant="dot" emptyText="—" />;
        case "responsable": {
          const text = peopleOf(item);
          return item.kind === "task" && !item.manager ? (
            <span className="text-muted-foreground">Sin asignar</span>
          ) : (
            <span title={text} className="block max-w-[200px] truncate">
              {text}
            </span>
          );
        }
        default:
          return undefined;
      }
    },
    [open],
  );

  const filtersSet = JSON.stringify(filters) !== JSON.stringify(normalizeCalendarioFilters(DEFAULT_CALENDARIO_FILTERS));
  const caption = rangeCaption(query.vista, { fecha: query.fecha, from: range.from, to: range.to, today: range.today });
  const kpis = useMemo<KpiStripItem[]>(() => kpiItems(range.kpis), [range.kpis]);
  const failed = rowsQuery.isError && !rowsQuery.data;

  return (
    <section aria-label="Calendario" data-slot="calendario-analitico" className="flex min-w-0 flex-col gap-4">
      <KpiStrip items={kpis} />
      <p data-slot="calendario-caption" className="font-mono text-[12.5px] text-muted-foreground">
        {caption}
      </p>
      <div {...cells.primeProps} className="min-w-0">
        <CellCommitProvider queryKeys={[qk.calendario.all, ...TAREAS_CELL_KEYS]}>
          <GroupedTable<AnaliticoRow>
            label={TABLE_LABEL}
            columns={columns}
            groups={groups}
            toggleAll={false}
            defaultExpanded
            sortable={["fecha"]}
            sort={{ key: "fecha", direction: order }}
            onSortChange={() => setOrder((current) => (current === "asc" ? "desc" : "asc"))}
            getRowId={(row) => row.id}
            renderCell={renderCell}
            isRowMuted={(row) => row.item.kind === "task" && row.item.completed}
            getRowLabel={(row) => row.item.title}
            selectable
            isRowSelectable={(row) => row.item.kind === "task"}
            selectedIds={selection.selectedIds}
            onSelectionChange={selection.onSelectionChange}
            rowActions={(row) => (row.item.kind === "task" ? deletes.rowActions(deleteTargetOf(taskOfItem(row.item)), () => open(row.id)) : [])}
            onRowDelete={deletes.canDelete ? (row) => (row.item.kind === "task" ? deletes.request([deleteTargetOf(taskOfItem(row.item))]) : undefined) : undefined}
            onLoadMore={loadMore}
            error={failed ? { title: ERROR_TITLE, onRetry: () => void rowsQuery.refetch() } : undefined}
            emptyState={{
              icon: CalendarX,
              title: EMPTY_TITLE,
              ...(filtersSet
                ? { action: { label: CLEAR_FILTERS, onClick: () => replaceCalendarioUrl({ ...query, filters: DEFAULT_CALENDARIO_FILTERS }) } }
                : {}),
            }}
          />
        </CellCommitProvider>
      </div>
      {deletes.dialog}
      <TaskBulkBar selection={selection} taskOf={taskOfId} staff={staff} deletes={deletes} invalidate={[qk.calendario.all]} hide={["apoyo", "fase"]} />
    </section>
  );
}
