"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Plus } from "lucide-react";

import {
  NO_TRAMO_KEY,
  NO_TRAMO_LABEL,
  PORTFOLIO_ANALITICO_DESCRIPTION,
  PROJECT_TASKS_TOGGLE_LABEL,
  PORTFOLIO_CLEAR_FILTERS,
  PORTFOLIO_FILTER_GROUP,
  PORTFOLIO_NO_MATCH,
  PORTFOLIO_SORTABLE_COLUMNS,
  PROJECTS_BY_TRAMO_TITLE,
  PROJECTS_TITLE,
  DEFAULT_PORTFOLIO_FILTERS,
  applyPortfolioFilters,
  delayText,
  deviationText,
  deviationTone,
  formatDeliveryDate,
  initialSortDirection,
  listedProjects,
  orderedTramos,
  parsePortfolioFilters,
  percentText,
  portfolioById,
  portfolioColumns,
  portfolioCsv,
  portfolioCsvFileName,
  portfolioFilterGroups,
  portfolioFiltersSearch,
  portfolioHeat,
  portfolioHeatLegend,
  portfolioKpis,
  portfolioTable,
  sortPortfolioRows,
  type PortfolioFilters,
  type PortfolioMostrar,
  type PortfolioSortKey,
  type PortfolioTableRow,
} from "@/components/proyectos/projects-portfolio-data";
import { EmptyState } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import ExportMenu from "@/components/ui/ExportMenu";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { FilterCard, type FilterGroup } from "@/components/widgets/FilterCard";
import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { KpiStrip } from "@/components/widgets/KpiStrip";
import { PageHeader } from "@/components/widgets/PageHeader";
import { ProjectAnaliticoTasks } from "@/components/widgets/ProjectAnaliticoTasks";
import { CLEAR_LABEL } from "@/components/widgets/editable-cell";
import { PORTFOLIO_COMMIT_KEYS, portfolioEditColumns } from "@/components/widgets/proyectos-cell-edits";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { HEAT_CELL_CLASS } from "@/components/widgets/record-table-format";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { catalogStaffOptions } from "@/lib/query/options/catalog";
import { proyectosPageOptions } from "@/lib/query/options/proyectos";
import { tramoColorVar } from "@/lib/tramos/compat";
import { cn } from "@/lib/utils";

/**
 * /proyectos in Analítico (#994, frame `Proyectos-Analitico`): header with
 * Exportar (CSV of the visible rows) and Nuevo proyecto, one `FilterCard`
 * (Mostrar, Tramo multi-select, Solo míos, Incluir pausados, search), the
 * `KpiStrip`, the "Proyectos por tramo" card (stacked bar and a legend whose
 * segments filter by tramo, expand / collapse all) and the portfolio in a
 * `GroupedTable`: one row per project (#1042), sortable, with heat cells and
 * totals. Tramo is a column and a filter, never a group: a project without
 * one is a row like the rest. Each project row expands into its open tasks
 * (`ProjectAnaliticoTasks`, loaded on first expand).
 *
 * Filters run on the client over `qk.proyectos.list()` (prefetched by the
 * page) and live in the URL (`mostrar`, `tramo`, `mios`, `pausados`, `q`),
 * written with `router.replace`. KPIs, the tramo bar and the totals are all
 * computed from the visible rows. "Nuevo proyecto" calls `onNewProject`;
 * without it, it sets `?nuevo=1`, which the page's create dialog listens to.
 *
 * Tramo actual and Responsable edit in place (#1026, `portfolioEditColumns`):
 * the other columns are calculated and stay inert.
 */
export type ProjectsAnaliticoLayoutProps = {
  /** Opens the create dialog. */
  onNewProject?(): void;
};

export const ANALITICO_SEARCH_LABEL = "Buscar proyectos";
export const ANALITICO_ERROR_TITLE = "No se pudieron cargar los proyectos";
export const ANALITICO_EMPTY_TITLE = "Aún no hay proyectos";
export const ANALITICO_NEW_PROJECT_LABEL = "Nuevo proyecto";
export const ANALITICO_EXPAND_ALL = "Expandir todo";
export const ANALITICO_COLLAPSE_ALL = "Contraer todo";
/** The table's accessible name (the tramo card above is "Proyectos por tramo"). */
export const PORTFOLIO_TABLE_LABEL = "Portafolio de proyectos";
/** The tramo bar's legend: each segment filters by its tramo. */
export const TRAMO_SEGMENTS_LABEL = "Filtrar por tramo";

const NEW_PROJECT_PARAM = "nuevo";
const SEARCH_DEBOUNCE_MS = 300;
/** A project created this recently flashes (`row-new`) when the list shows it. */
const NEW_ROW_MS = 60_000;

type Sort = { key: PortfolioSortKey; direction: "asc" | "desc" } | null;
const ROWS_GROUP_ID = "proyectos";

const SEGMENT_LABEL = "font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground";

/** Loading: header, 5 KPI blocks, the filter block and an 8-row table. */
export function ProjectsAnaliticoSkeleton(): ReactNode {
  return (
    <div role="status" className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando proyectos">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-12 rounded-md" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={cn("h-[78px] rounded-xl", i === 4 && "col-span-2 lg:col-span-1")} />
        ))}
      </div>
      <div className="flex flex-col gap-1 rounded-xl border p-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    </div>
  );
}

/** Pressed toggles in a labelled group (Tramo multi-select, Solo míos, Incluir pausados). */
function ToggleGroup({
  group,
  selected,
  onToggle,
  showLabel,
}: {
  group: FilterGroup;
  selected: string[];
  onToggle(value: string): void;
  showLabel: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showLabel ? <span className={SEGMENT_LABEL}>{group.label}</span> : null}
      <div role="group" aria-label={group.label} className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5">
        {group.options.map((option) => {
          const pressed = selected.includes(option.value);
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={pressed ? "default" : "ghost"}
              aria-pressed={pressed}
              onClick={() => onToggle(option.value)}
            >
              {option.color ? (
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: option.color }} />
              ) : null}
              {option.label}
              {option.count !== undefined ? (
                <span className={cn("font-mono", pressed ? "text-primary-foreground" : "text-muted-foreground")}>{option.count}</span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** Starts a download of `text` as `fileName`. */
function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The Analítico body over loaded page data. */
function AnaliticoContent({ data, onNewProject }: { data: ProyectosPageData; onNewProject(): void }) {
  const { projects, portfolio, tramos, canSeeAdminData, canCreateProject, canChangeProjectStage, viewerStaffId } = data;
  const canEditProjectGeneral = data.canEditProjectGeneral ?? false;
  const qc = useQueryClient();
  const staffQuery = useQuery({ ...catalogStaffOptions(), enabled: canEditProjectGeneral });
  const router = useRouter();
  const pathname = usePathname() ?? "/proyectos";
  const searchParams = useSearchParams();
  const searchKey = searchParams?.toString() ?? "";

  // Local filters follow the URL; a click updates them at once and writes the URL.
  const [filters, setFilters] = useState<PortfolioFilters>(() => parsePortfolioFilters(new URLSearchParams(searchKey)));
  const [prevSearchKey, setPrevSearchKey] = useState(searchKey);
  if (searchKey !== prevSearchKey) {
    setPrevSearchKey(searchKey);
    const parsed = parsePortfolioFilters(new URLSearchParams(searchKey));
    // The draft search keeps what is being typed (the URL holds it trimmed).
    setFilters((current) => (parsed.q === current.q.trim() ? { ...parsed, q: current.q } : parsed));
  }
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const [sort, setSort] = useState<Sort>(null);
  // Project rows whose tasks are shown; each loads them on its first expand.
  const [openProjects, setOpenProjects] = useState<ReadonlySet<string>>(() => new Set());
  const [mountedAt] = useState(() => Date.now());

  const rows = useMemo(() => portfolioById(portfolio), [portfolio]);
  const listed = useMemo(() => listedProjects(projects), [projects]);
  // Tramo keys the URL may name; anything else is ignored.
  const knownTramos = useMemo(() => {
    const keys = new Set(orderedTramos(listed, tramos).map((t) => t.key));
    keys.add(NO_TRAMO_KEY);
    return keys;
  }, [listed, tramos]);
  const effective = useMemo<PortfolioFilters>(
    () => ({ ...filters, tramos: filters.tramos.filter((key) => knownTramos.has(key)) }),
    [filters, knownTramos],
  );

  const visible = useMemo(
    () => applyPortfolioFilters(projects, rows, effective, viewerStaffId),
    [projects, rows, effective, viewerStaffId],
  );
  const filterGroups = useMemo(
    () => portfolioFilterGroups(projects, rows, effective, viewerStaffId),
    [projects, rows, effective, viewerStaffId],
  );
  const kpis = useMemo(() => portfolioKpis(visible, rows, new Date(mountedAt)), [visible, rows, mountedAt]);
  const table = useMemo(() => portfolioTable(visible, rows, tramos, { canSeeAdminData }), [visible, rows, tramos, canSeeAdminData]);
  const tableRows = useMemo(() => sortPortfolioRows(table.rows, sort), [table.rows, sort]);
  const groups = useMemo<Group<PortfolioTableRow>[]>(
    () => (tableRows.length > 0 ? [{ id: ROWS_GROUP_ID, label: PORTFOLIO_TABLE_LABEL, metrics: [], rows: tableRows, headless: true }] : []),
    [tableRows],
  );
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  // Responsable: the staff catalog; the projects' own people until it loads.
  const staff = useMemo(() => {
    if (staffQuery.data) return staffQuery.data;
    const byId = new Map<string, { id: string; name: string }>();
    for (const p of projects) for (const s of [p.manager, p.coordinator, ...p.members]) if (s) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [staffQuery.data, projects]);
  const columns = useMemo(
    () =>
      portfolioEditColumns(portfolioColumns({ canSeeAdminData }), {
        qc,
        projects: projectsById,
        tramos,
        staff,
        canChangeProjectStage,
        canEditProjectGeneral,
        canSeeAdminData,
      }),
    [canSeeAdminData, qc, projectsById, tramos, staff, canChangeProjectStage, canEditProjectGeneral],
  );
  const createdAt = useMemo(() => new Map(projects.map((p) => [p.id, Date.parse(p.createdAt)])), [projects]);

  const staffRefs = useMemo(() => staff.map((s) => ({ id: s.id, name: s.name })), [staff]);

  function writeUrl(next: PortfolioFilters) {
    const search = portfolioFiltersSearch(next, new URLSearchParams(window.location.search));
    router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
  }

  function update(next: PortfolioFilters) {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    setFilters(next);
    writeUrl(next);
  }

  function handleSearch(value: string) {
    const next = { ...filters, q: value };
    setFilters(next);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      writeUrl(next);
    }, SEARCH_DEBOUNCE_MS);
  }

  function toggleTramo(key: string) {
    const tramosNext = effective.tramos.includes(key) ? effective.tramos.filter((k) => k !== key) : [...effective.tramos, key];
    update({ ...filters, tramos: tramosNext });
  }

  function handleSort(key: string) {
    const column = key as PortfolioSortKey;
    setSort((current) =>
      current && current.key === column
        ? { key: column, direction: current.direction === "desc" ? "asc" : "desc" }
        : { key: column, direction: initialSortDirection(column) },
    );
  }

  function toggleProject(id: string) {
    setOpenProjects((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExport() {
    downloadText(portfolioCsvFileName(new Date()), portfolioCsv(tableRows, { canSeeAdminData }), "text/csv;charset=utf-8");
  }

  function renderCell(key: string, row: PortfolioTableRow): ReactNode | undefined {
    const heat = portfolioHeat(key, row);
    const heated = (content: ReactNode) =>
      heat ? <span className={cn("inline-block rounded px-1.5 py-0.5", HEAT_CELL_CLASS[heat])}>{content}</span> : content;
    switch (key) {
      case "name":
        return (
          <div className="flex max-w-[280px] flex-col">
            <Link href={`/proyectos/${row.id}`} title={row.name} className="truncate font-medium underline-offset-3 hover:underline">
              {row.name}
            </Link>
            {row.client ? (
              <span className="truncate text-xs text-muted-foreground" title={row.client}>
                {row.client}
              </span>
            ) : null}
          </div>
        );
      case "tramo": {
        const project = projectsById.get(row.id);
        const tramo = project && !project.needsTramo ? (project.currentWorkflow ?? project.tramos.find((t) => t.current) ?? null) : null;
        return tramo ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: tramoColorVar(tramo.key) }} />
            <span className="truncate">{tramo.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{NO_TRAMO_LABEL}</span>
        );
      }
      case "manager": {
        const manager = projectsById.get(row.id)?.manager;
        return manager ? (
          <span className="block max-w-[170px] truncate">{manager.name}</span>
        ) : (
          <span className="text-muted-foreground">{CLEAR_LABEL.person}</span>
        );
      }
      case "real": {
        const color = row.tramoKey ? tramoColorVar(row.tramoKey) : "var(--muted-foreground)";
        return (
          <span className="inline-flex items-center justify-end gap-2">
            <span
              aria-hidden="true"
              className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted"
            >
              <span className="grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${row.real}%`, backgroundColor: color }} />
            </span>
            <span className="font-mono">{percentText(row.real)}</span>
          </span>
        );
      }
      case "deviation": {
        const tone = heat ? null : deviationTone(row.deviation);
        return heated(
          <span className={cn("font-mono", tone === "destructive" && "text-destructive", tone === "success" && "text-success")}>
            {deviationText(row.deviation)}
          </span>,
        );
      }
      case "overduePct":
        return heated(<span className="font-mono">{percentText(row.overduePct)}</span>);
      case "overdue":
        return <span className={cn("font-mono", row.overdue > 0 && "text-destructive")}>{row.overdue}</span>;
      case "avgDelayDays":
        return <span className="font-mono">{delayText(row.avgDelayDays)}</span>;
      case "nextDelivery":
        return row.nextDelivery ? (
          <span className="truncate" title={row.nextDelivery.title}>
            {row.nextDelivery.title} · <span className="font-mono">{formatDeliveryDate(row.nextDelivery.date)}</span>
          </span>
        ) : (
          "—"
        );
      case "budgetSpentPct":
        return heated(<span className="font-mono">{percentText(row.budgetSpentPct)}</span>);
      default:
        return undefined;
    }
  }

  const mostrarGroup = filterGroups.find((g) => g.id === PORTFOLIO_FILTER_GROUP.mostrar)!;
  const tramoGroup = filterGroups.find((g) => g.id === PORTFOLIO_FILTER_GROUP.tramo)!;
  const miosGroup = filterGroups.find((g) => g.id === PORTFOLIO_FILTER_GROUP.mios)!;
  const pausadosGroup = filterGroups.find((g) => g.id === PORTFOLIO_FILTER_GROUP.pausados)!;

  const totalShown = visible.length;
  // The tramo bar: the Tramo filter's options (counts over the other filters), the empty ones left out.
  const segments = tramoGroup.options.filter((option) => (option.count ?? 0) > 0);

  const headerActions = (
    <>
      {listed.length > 0 ? <ExportMenu formats={["csv"] as const} onExport={handleExport} scaleClassName="scale-100" /> : null}
      {canCreateProject ? (
        <Button type="button" onClick={onNewProject}>
          <Plus aria-hidden="true" />
          {ANALITICO_NEW_PROJECT_LABEL}
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-5" data-slot="projects-analitico">
      <PageHeader title={PROJECTS_TITLE} description={PORTFOLIO_ANALITICO_DESCRIPTION} actions={headerActions} />

      {listed.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={ANALITICO_EMPTY_TITLE}
          description={canCreateProject ? "Crea el primero para empezar a darle seguimiento." : undefined}
          action={canCreateProject ? { label: ANALITICO_NEW_PROJECT_LABEL, onClick: onNewProject } : undefined}
        />
      ) : (
        <>
          <FilterCard
            groups={[mostrarGroup]}
            onChange={(groupId, value) => {
              if (groupId === PORTFOLIO_FILTER_GROUP.mostrar) update({ ...filters, mostrar: value as PortfolioMostrar });
            }}
            extra={
              <>
                {tramoGroup.options.length > 0 ? (
                  <ToggleGroup group={tramoGroup} selected={effective.tramos} onToggle={toggleTramo} showLabel />
                ) : null}
                <ToggleGroup
                  group={miosGroup}
                  selected={filters.mios ? ["1"] : []}
                  onToggle={() => update({ ...filters, mios: !filters.mios })}
                  showLabel={false}
                />
                <ToggleGroup
                  group={pausadosGroup}
                  selected={filters.pausados ? ["1"] : []}
                  onToggle={() => update({ ...filters, pausados: !filters.pausados })}
                  showLabel={false}
                />
                <Input
                  type="search"
                  aria-label={ANALITICO_SEARCH_LABEL}
                  placeholder="Buscar"
                  value={filters.q}
                  onChange={(event) => handleSearch(event.target.value)}
                  className="h-8 w-40"
                />
              </>
            }
          />

          <div className="flex flex-col gap-4">
            <KpiStrip items={kpis} />

            <section aria-label={PROJECTS_BY_TRAMO_TITLE} className="flex flex-col gap-2.5 rounded-xl border bg-card px-4 py-3.5 shadow-[var(--shadow-card)]">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[13.5px] font-semibold">{PROJECTS_BY_TRAMO_TITLE}</h2>
                <span className="font-mono text-xs text-muted-foreground">
                  {totalShown} {totalShown === 1 ? "proyecto" : "proyectos"}
                </span>
              </div>
              {segments.length > 0 ? (
                <>
                  <div aria-hidden="true" className="flex h-2.5 gap-[3px]">
                    {segments.map((segment) => (
                      <span
                        key={segment.value}
                        className="grow rounded-full"
                        style={{ flex: segment.count, backgroundColor: segment.color }}
                      />
                    ))}
                  </div>
                  <ul aria-label={TRAMO_SEGMENTS_LABEL} className="flex flex-wrap gap-x-1 gap-y-1 text-[12.5px]">
                    {segments.map((segment) => {
                      const pressed = effective.tramos.includes(segment.value);
                      return (
                        <li key={segment.value}>
                          <button
                            type="button"
                            aria-pressed={pressed}
                            data-slot="tramo-segment"
                            onClick={() => toggleTramo(segment.value)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                              pressed && "bg-muted",
                            )}
                          >
                            <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: segment.color }} />
                            {segment.label} <b className="font-semibold">{segment.count}</b>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-secondary-foreground"
                  onClick={() => setOpenProjects(new Set(tableRows.map((row) => row.id)))}
                >
                  {ANALITICO_EXPAND_ALL}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-secondary-foreground" onClick={() => setOpenProjects(new Set())}>
                  {ANALITICO_COLLAPSE_ALL}
                </Button>
              </div>
            </section>

            {groups.length > 0 ? (
              <CellCommitProvider queryKeys={PORTFOLIO_COMMIT_KEYS}>
                <GroupedTable<PortfolioTableRow>
                  toggleAll={false}
                  label={PORTFOLIO_TABLE_LABEL}
                  columns={columns}
                  groups={groups}
                  layout="table"
                  footerRow={table.totals}
                  getRowId={(row) => row.id}
                  rowDetail={{
                    isOpen: (row) => openProjects.has(row.id),
                    onToggle: (row) => toggleProject(row.id),
                    label: (row) => PROJECT_TASKS_TOGGLE_LABEL(row.name),
                    render: (row) => <ProjectAnaliticoTasks project={{ id: row.id, name: row.name }} tramos={tramos} staff={staffRefs} />,
                  }}
                  renderCell={renderCell}
                  isRowNew={(row) => mountedAt - (createdAt.get(row.id) ?? 0) < NEW_ROW_MS}
                  isRowMuted={(row) => projects.find((p) => p.id === row.id)?.status === "pausado"}
                  sortable={[...PORTFOLIO_SORTABLE_COLUMNS].filter((key) => columns.some((c) => c.key === key))}
                  sort={sort}
                  onSortChange={handleSort}
                />
              </CellCommitProvider>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-4 py-8 text-center text-[12.5px]">
                <p>{PORTFOLIO_NO_MATCH}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => update(DEFAULT_PORTFOLIO_FILTERS)}>
                  {PORTFOLIO_CLEAR_FILTERS}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{portfolioHeatLegend({ canSeeAdminData })}</p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The Analítico branch of /proyectos; renders its own loading and error
 * states (the page prefetches the read, so the first render has the data).
 */
export function ProjectsAnaliticoLayout({ onNewProject }: ProjectsAnaliticoLayoutProps = {}): ReactNode {
  const router = useRouter();
  const pathname = usePathname() ?? "/proyectos";
  const query = useQuery(proyectosPageOptions());

  function openNew() {
    if (onNewProject) {
      onNewProject();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set(NEW_PROJECT_PARAM, "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (query.isPending) return <ProjectsAnaliticoSkeleton />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={PROJECTS_TITLE} description={PORTFOLIO_ANALITICO_DESCRIPTION} />
        <ErrorState title={ANALITICO_ERROR_TITLE} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  return <AnaliticoContent data={query.data} onNewProject={openNew} />;
}
