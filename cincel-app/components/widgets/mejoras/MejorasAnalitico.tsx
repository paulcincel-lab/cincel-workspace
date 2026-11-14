"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { BulkActionBar, BULK_BAR_BUTTON_CLASS } from "@/components/widgets/BulkActionBar";
import {
  EMPTY_TEXT,
  GithubChip,
  KindChip,
  PickSelect,
  TicketAvatar,
  type MejorasViewProps,
  type PickOption,
} from "@/components/widgets/mejoras/mejoras-parts";
import { useMejorasRows, useTriage } from "@/components/widgets/mejoras/use-triage";
import { SELECT_ALL_LABEL, SELECT_ROW_LABEL, loadMoreText, selectionState, setRowsSelected, toggleRowSelection } from "@/components/widgets/table-rows";
import { timeAgo } from "@/lib/my-space/my-tasks";
import { catalogStaffOptions } from "@/lib/query/options/catalog";
import { TRIAGE_STATUSES, UNASSIGNED_PARAM, changesRow, type TriageChange } from "@/lib/soporte/mejoras-triage";
import {
  AREA_LABEL,
  KIND_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TICKET_AREAS,
  TICKET_KINDS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketFilters,
  type TicketListRow,
  type TicketPatch,
  type TicketPerson,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/types/soporte";

const ALL = "__all__";
const NONE = "__none__";
const FILTER_TRIGGER = "h-9 w-full sm:w-40";
const CELL_TRIGGER = "h-8 w-full min-w-32";

const STATUS_OPTIONS: PickOption[] = TICKET_STATUSES.map((status) => ({
  value: status,
  label: STATUS_LABEL[status],
  // Descartada needs a public reason: it is set in the detail.
  disabled: !(TRIAGE_STATUSES as readonly TicketStatus[]).includes(status),
}));
const PRIORITY_OPTIONS: PickOption[] = [
  { value: NONE, label: "Sin prioridad" },
  ...TICKET_PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_LABEL[priority] })),
];

const withAll = (label: string, options: PickOption[]): PickOption[] => [{ value: ALL, label }, ...options];

/** Table columns count, for the empty row. */
const COLUMNS = 11;

/**
 * Mejoras, Analítico style (frame `Mejoras-Analitico`): a table of every
 * solicitud with filters (estado, tipo, área, prioridad, asignado, autor,
 * search), editable cells for estado, prioridad and asignado, row checkboxes
 * with a bulk bar for estado and asignado, and "Cargar más". Every change goes
 * through the triage write, so it records events and can be undone.
 */
export function MejorasAnalitico({ filters, onFiltersChange, onOpen }: MejorasViewProps) {
  const { rows, isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useMejorasRows(filters);
  const { data: staff = [] } = useQuery(catalogStaffOptions());
  const { apply } = useTriage();
  const [now] = useState(() => new Date());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const people = useMemo(() => new Map<string, TicketPerson>(staff.map((s) => [s.id, { id: s.id, name: s.name, photoUrl: null }])), [staff]);
  const assigneeOptions = useMemo<PickOption[]>(
    () => [{ value: NONE, label: "Sin asignar" }, ...staff.map((s) => ({ value: s.id, label: s.name }))],
    [staff],
  );

  if (error && rows.length === 0) throw error;

  const setFilter = (patch: Partial<TicketFilters>) => onFiltersChange({ ...filters, ...patch });
  const cleared = (key: keyof TicketFilters): Partial<TicketFilters> => ({ [key]: undefined });

  const pickAssignee = (value: string): { assigneeId: string | null; person: TicketPerson | null } =>
    value === NONE ? { assigneeId: null, person: null } : { assigneeId: value, person: people.get(value) ?? null };

  const edit = (row: TicketListRow, patch: TicketPatch, assignee?: TicketPerson | null) => {
    if (!changesRow(row, patch)) return;
    void apply([{ id: row.id, patch, assignee }]);
  };

  const bulk = (patch: TicketPatch, assignee?: TicketPerson | null) => {
    const changes: TriageChange[] = rows.filter((row) => selected.has(row.id) && changesRow(row, patch)).map((row) => ({ id: row.id, patch, assignee }));
    if (changes.length > 0) void apply(changes);
    setSelected(new Set());
  };

  const assigneeFilterValue = filters.unassigned ? UNASSIGNED_PARAM : (filters.assigneeId ?? ALL);
  const state = selectionState(selected, ids);

  return (
    <div className="flex flex-col gap-4">
      <div role="search" aria-label="Filtros" className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        <Input
          type="search"
          value={filters.q ?? ""}
          onChange={(event) => setFilter({ q: event.target.value || undefined })}
          placeholder="Buscar por código, título o descripción"
          aria-label="Buscar solicitudes"
          className="min-[390px]:col-span-2 lg:w-72"
        />
        <PickSelect
          label="Estado"
          className={FILTER_TRIGGER}
          value={filters.status ?? ALL}
          options={withAll("Todos los estados", STATUS_OPTIONS.map((o) => ({ ...o, disabled: false })))}
          onPick={(value) => setFilter(value === ALL ? cleared("status") : { status: value as TicketStatus })}
        />
        <PickSelect
          label="Tipo"
          className={FILTER_TRIGGER}
          value={filters.kind ?? ALL}
          options={withAll("Todos los tipos", TICKET_KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] })))}
          onPick={(value) => setFilter(value === ALL ? cleared("kind") : { kind: value as TicketFilters["kind"] })}
        />
        <PickSelect
          label="Área"
          className={FILTER_TRIGGER}
          value={filters.area ?? ALL}
          options={withAll("Todas las áreas", TICKET_AREAS.map((area) => ({ value: area, label: AREA_LABEL[area] })))}
          onPick={(value) => setFilter(value === ALL ? cleared("area") : { area: value as TicketFilters["area"] })}
        />
        <PickSelect
          label="Prioridad"
          className={FILTER_TRIGGER}
          value={filters.priority ?? ALL}
          options={withAll("Todas las prioridades", TICKET_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })))}
          onPick={(value) => setFilter(value === ALL ? cleared("priority") : { priority: value as TicketPriority })}
        />
        <PickSelect
          label="Asignado"
          className={FILTER_TRIGGER}
          value={assigneeFilterValue}
          options={withAll("Todos los asignados", [{ value: UNASSIGNED_PARAM, label: "Sin asignar" }, ...staff.map((s) => ({ value: s.id, label: s.name }))])}
          onPick={(value) =>
            setFilter(
              value === ALL
                ? { assigneeId: undefined, unassigned: undefined }
                : value === UNASSIGNED_PARAM
                  ? { assigneeId: undefined, unassigned: true }
                  : { assigneeId: value, unassigned: undefined },
            )
          }
        />
        <PickSelect
          label="Autor"
          className={FILTER_TRIGGER}
          value={filters.authorId ?? ALL}
          options={withAll("Todos los autores", staff.map((s) => ({ value: s.id, label: s.name })))}
          onPick={(value) => setFilter(value === ALL ? cleared("authorId") : { authorId: value })}
        />
      </div>

      {isPending ? (
        <LoadingSkeleton variant="table" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={SELECT_ALL_LABEL}
                    checked={state === "all"}
                    indeterminate={state === "some"}
                    onCheckedChange={(checked) => setSelected(setRowsSelected(selected, ids, checked === true))}
                  />
                </TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Asignado</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Creada</TableHead>
                <TableHead>GitHub</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="py-8 text-center text-muted-foreground">
                    {EMPTY_TEXT}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} data-ticket={row.code} data-state={selected.has(row.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={SELECT_ROW_LABEL(row.code)}
                        checked={selected.has(row.id)}
                        onCheckedChange={() => setSelected(toggleRowSelection(selected, row.id, { order: ids }))}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.code}</TableCell>
                    <TableCell className="max-w-72">
                      <button
                        type="button"
                        onClick={() => onOpen(row.code)}
                        className="block max-w-full truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {row.title}
                      </button>
                    </TableCell>
                    <TableCell>
                      <KindChip kind={row.kind} />
                    </TableCell>
                    <TableCell>{AREA_LABEL[row.area]}</TableCell>
                    <TableCell>
                      <PickSelect
                        label={`Estado de ${row.code}`}
                        className={CELL_TRIGGER}
                        value={row.status}
                        options={STATUS_OPTIONS}
                        onPick={(value) => edit(row, { status: value as TicketStatus })}
                      />
                    </TableCell>
                    <TableCell>
                      <PickSelect
                        label={`Prioridad de ${row.code}`}
                        className={CELL_TRIGGER}
                        value={row.priority ?? NONE}
                        options={PRIORITY_OPTIONS}
                        onPick={(value) => edit(row, { priority: value === NONE ? null : (value as TicketPriority) })}
                      />
                    </TableCell>
                    <TableCell>
                      <PickSelect
                        label={`Asignado de ${row.code}`}
                        className={CELL_TRIGGER}
                        value={row.assignee?.id ?? NONE}
                        options={assigneeOptions}
                        onPick={(value) => {
                          const { assigneeId, person } = pickAssignee(value);
                          edit(row, { assigneeId }, person);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <TicketAvatar person={row.author} />
                        <span className="whitespace-nowrap">{row.author.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <time dateTime={row.createdAt}>{timeAgo(row.createdAt, now)}</time>
                    </TableCell>
                    <TableCell>
                      <GithubChip row={row} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {hasNextPage ? (
        <Button type="button" variant="outline" className="self-center" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {loadMoreText(undefined)}
        </Button>
      ) : null}

      <BulkActionBar count={selected.size} actions={[]} onClear={() => setSelected(new Set())}>
        <PickSelect
          label="Cambiar estado"
          className={`${BULK_BAR_BUTTON_CLASS} w-36`}
          value="__pick__"
          options={[{ value: "__pick__", label: "Cambiar estado", disabled: true }, ...STATUS_OPTIONS]}
          onPick={(value) => bulk({ status: value as TicketStatus })}
        />
        <PickSelect
          label="Asignar a"
          className={`${BULK_BAR_BUTTON_CLASS} w-36`}
          value="__pick__"
          options={[{ value: "__pick__", label: "Asignar a", disabled: true }, ...assigneeOptions]}
          onPick={(value) => {
            const { assigneeId, person } = pickAssignee(value);
            bulk({ assigneeId }, person);
          }}
        />
      </BulkActionBar>
    </div>
  );
}
