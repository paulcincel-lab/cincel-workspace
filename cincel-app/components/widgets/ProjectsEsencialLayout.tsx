"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Plus, Search } from "lucide-react";

import {
  ALL_TRAMOS_KEY,
  NEXT_DELIVERY_LABEL,
  NO_TRAMO_KEY,
  NO_TRAMO_LABEL,
  PROJECTS_TITLE,
  currentTramoOf,
  esencialDescription,
  esencialProjectRows,
  filterByTramo,
  formatDeliveryDate,
  orderedTramos,
  portfolioById,
  searchProjects,
  tramoPills,
  type EsencialProjectRow,
  type TramoPill,
} from "@/components/proyectos/projects-portfolio-data";
import { EmptyState } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/shadcn/input-group";
import { ProjectsEsencialSkeleton } from "@/components/widgets/route-skeletons";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { PageHeader } from "@/components/widgets/PageHeader";
import { RowActionsMenu } from "@/components/widgets/RowActionsMenu";
import type { TableRowAction } from "@/components/widgets/table-rows";
import { useDeleteProject } from "@/components/proyectos/use-delete-project";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { proyectosPageOptions } from "@/lib/query/options/proyectos";
import { selectSelectedTramo, useProyectosDashboard } from "@/lib/stores/proyectos-dashboard-store";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { ProjectListItem } from "@/lib/types/core";

/**
 * /proyectos in Esencial (#993, frame `Proyectos-Esencial`): header with the
 * active count, a row of tramo pills (single choice, `selectedKpi` of
 * `useProyectosDashboard`, session only) and the `?q=` search, then one soft
 * `EsencialCard` per active project: tramo line, two chips (open tasks and
 * overdue / al día) and the next delivery. Paused projects are reachable from
 * Analítico only. No tables, charts or rings.
 *
 * Reads `qk.proyectos.list()` (prefetched by the page). "Nuevo proyecto"
 * calls `onNewProject`; without it, it sets `?nuevo=1`, which the page's
 * create dialog listens to.
 */
export type ProjectsEsencialLayoutProps = {
  /** Opens the create dialog. */
  onNewProject?(): void;
};

export const ESENCIAL_SEARCH_LABEL = "Buscar proyectos";
export const ESENCIAL_PILLS_LABEL = "Filtrar por etapa";
export const ESENCIAL_ERROR_TITLE = "No se pudieron cargar los proyectos";
export const ESENCIAL_EMPTY_TITLE = "Aún no hay proyectos";
export const ESENCIAL_NEW_PROJECT_LABEL = "Nuevo proyecto";
export const ESENCIAL_CLEAR_TRAMO_LABEL = "Ver todas las etapas";
/** Same param and debounce as the other styles (`ProjectsPortfolio`). */
const SEARCH_PARAM = "q";
const NEW_PROJECT_PARAM = "nuevo";
const SEARCH_DEBOUNCE_MS = 300;

/** Soft tint behind the current tramo dot, per chart slot (tramo tokens), with a mix fallback. */
const SOFT_TOKEN: Record<string, string> = {
  "1": "--tint-primary",
  "2": "--tint-violet",
  "3": "--tint-warning",
  "4": "--tint-cyan",
};

/** `var(--chart-N)` → `var(--chart-N-ink)`; any other color stays as is. */
function inkOf(colorVar: string): string {
  const slot = /^var\(--chart-(\d)\)$/.exec(colorVar.trim())?.[1];
  return slot ? `var(--chart-${slot}-ink)` : colorVar;
}

/** The soft tint of a tramo color (its tint token, else a 20 % mix into transparent). */
function softOf(colorVar: string): string {
  const slot = /^var\(--chart-(\d)\)$/.exec(colorVar.trim())?.[1];
  const mix = `color-mix(in oklch, ${colorVar} 20%, transparent)`;
  const token = slot ? SOFT_TOKEN[slot] : undefined;
  return token ? `var(${token}, ${mix})` : mix;
}

/** Sets (or removes) one search param with `history.replaceState` (no server render). */
function replaceSearchParam(pathname: string, key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const search = params.toString();
  window.history.replaceState(window.history.state, "", `${pathname}${search ? `?${search}` : ""}${window.location.hash}`);
}

export { ProjectsEsencialSkeleton };

function projectsCountText(n: number): string {
  return `${n} ${n === 1 ? "proyecto" : "proyectos"}`;
}

type PillWithColor = TramoPill & { colorVar?: string };

/** Tramo filter pills: a labelled radiogroup, arrows move the focus, Space / Enter select. */
function TramoPills({ pills, value, onChange }: { pills: PillWithColor[]; value: string; onChange(key: string): void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = Math.max(
    0,
    pills.findIndex((p) => p.key === value),
  );
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const tabIndexOf = (index: number) => (index === (focusIndex ?? checkedIndex) ? 0 : -1);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        target = (index + 1) % pills.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        target = (index - 1 + pills.length) % pills.length;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = pills.length - 1;
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        onChange(pills[index].key);
        return;
      default:
        return;
    }
    event.preventDefault();
    setFocusIndex(target);
    refs.current[target]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ESENCIAL_PILLS_LABEL}
      className="flex flex-wrap items-center gap-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusIndex(null);
      }}
    >
      {pills.map((pill, index) => {
        const checked = pill.key === value;
        return (
          <Button
            key={pill.key}
            ref={(el: HTMLButtonElement | null) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabIndexOf(index)}
            data-value={pill.key}
            variant={checked ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 rounded-full px-3 text-[12.5px] font-medium"
            onClick={() => onChange(pill.key)}
            onFocus={() => setFocusIndex(index)}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, index)}
          >
            {pill.colorVar ? (
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: pill.colorVar }} />
            ) : null}
            {pill.label}
            <span className={checked ? "font-mono tabular-nums" : "font-mono tabular-nums text-muted-foreground"}>{pill.count}</span>
          </Button>
        );
      })}
    </div>
  );
}

/** Four dots joined by connectors: done, current (with a soft halo) and next (outlined). */
function TramoLine({ row, tramoName }: { row: EsencialProjectRow; tramoName: string | null }) {
  const noTramo = row.tramoKey === null;
  const columns: CSSProperties = { gridTemplateColumns: `repeat(${Math.max(1, row.steps.length)}, minmax(0, 1fr))` };
  return (
    <div
      className="flex flex-col gap-1.5"
      aria-label={`Etapa actual: ${tramoName ?? NO_TRAMO_LABEL}`}
      role="group"
      data-slot="tramo-line"
    >
      <div aria-hidden="true" className="grid items-center" style={columns}>
        {row.steps.map((step, index) => {
          const state = noTramo ? "next" : step.state;
          const last = index === row.steps.length - 1;
          const dot: CSSProperties =
            state === "current"
              ? { background: step.colorVar, boxShadow: `0 0 0 4px ${softOf(step.colorVar)}` }
              : state === "done"
                ? { background: step.colorVar }
                : {};
          return (
            <div key={step.key} className="flex items-center" data-state={state}>
              <span
                className={
                  state === "current"
                    ? "size-3.5 shrink-0 rounded-full"
                    : state === "done"
                      ? "size-2.5 shrink-0 rounded-full"
                      : "size-2.5 shrink-0 rounded-full border-2 border-border bg-card"
                }
                style={dot}
              />
              {last ? null : (
                <span
                  className={state === "done" ? "mx-1 h-0.5 flex-1 rounded-full" : "mx-1 h-0.5 flex-1 rounded-full bg-border"}
                  style={state === "done" ? { background: step.colorVar } : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
      {noTramo ? (
        <span className="w-fit rounded-full bg-muted px-2.5 py-[3px] text-[12px] font-medium text-muted-foreground">
          {NO_TRAMO_LABEL}
        </span>
      ) : (
        <div aria-hidden="true" className="grid text-[12px] text-muted-foreground" style={columns}>
          {row.stepLabels.map((label) => {
            const step = row.steps.find((s) => s.key === label.key);
            return (
              <span
                key={label.key}
                className={label.current ? "truncate font-semibold" : "truncate"}
                style={label.current && step ? { color: inkOf(step.colorVar) } : undefined}
              >
                {label.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  row,
  tramoName,
  index,
  actions = [],
}: {
  row: EsencialProjectRow;
  tramoName: string | null;
  index: number;
  /** The card's `⋯` entries ("Eliminar proyecto", #1050); none hides the menu. */
  actions?: TableRowAction[];
}) {
  return (
    <div className="group/row contents">
      <EsencialCard
        title={row.name}
        href={`/proyectos/${row.id}`}
        headingLevel={2}
        index={index}
        action={actions.length > 0 ? <RowActionsMenu rowLabel={row.name} actions={actions} /> : undefined}
        meta={row.subtitle ? <span className="block truncate text-[12.5px] text-muted-foreground">{row.subtitle}</span> : undefined}
      >
        <div className="flex flex-col gap-3.5" data-slot="project-card-body">
          <TramoLine row={row} tramoName={tramoName} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-[3px] text-[12.5px] font-medium text-foreground">
              <span className="font-mono tabular-nums">{row.open}</span> {row.open === 1 ? "abierta" : "abiertas"}
            </span>
            {row.status === "vencidas" ? (
              <Badge variant="destructive" className="h-auto px-2.5 py-[3px] text-[12.5px]">
                <span className="font-mono tabular-nums">{row.overdue}</span> {row.overdue === 1 ? "vencida" : "vencidas"}
              </Badge>
            ) : (
              <Badge variant="success" className="h-auto px-2.5 py-[3px] text-[12.5px]">
                Al día
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-muted pt-3 text-[12.5px]">
            <span className="shrink-0 text-muted-foreground">{NEXT_DELIVERY_LABEL}</span>
            {row.nextDelivery ? (
              <span className="min-w-0 truncate text-right">
                <span className="font-medium">{row.nextDelivery.title} ·</span>{" "}
                <span className="font-mono tabular-nums">{formatDeliveryDate(row.nextDelivery.date)}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </EsencialCard>
    </div>
  );
}

export function ProjectsEsencialLayout({ onNewProject }: ProjectsEsencialLayoutProps = {}): ReactNode {
  const query = useQuery(proyectosPageOptions());
  if (query.isPending) return <ProjectsEsencialSkeleton />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={PROJECTS_TITLE} />
        <ErrorState title={ESENCIAL_ERROR_TITLE} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  return <EsencialList data={query.data} onNewProject={onNewProject} />;
}

function EsencialList({
  data,
  onNewProject,
}: {
  data: ProyectosPageData;
  onNewProject?(): void;
}) {
  const { projects, portfolio, tramos, canCreateProject } = data;
  const pathname = usePathname() ?? "/proyectos";
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams?.get(SEARCH_PARAM) ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchId = useId();
  // Card menu "Eliminar proyecto" (#1050), only with `canDeleteProject`.
  const deleteProject = useDeleteProject();

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const selectedTramo = useProyectosDashboard(selectSelectedTramo);
  const selectKpi = useProyectosDashboard((s) => s.selectKpi);

  // Esencial lists the active projects only; paused ones live in Analítico.
  const listed = useMemo<ProjectListItem[]>(() => projects.filter((p) => p.status === "activo"), [projects]);
  const tramoOrder = useMemo(() => orderedTramos(listed, tramos), [listed, tramos]);
  const rowsById = useMemo(() => portfolioById(portfolio), [portfolio]);

  // The selection applies only while its tramo still has listed projects.
  const tramoMembers = useMemo(
    () => (selectedTramo === null ? [] : filterByTramo(listed, selectedTramo)),
    [listed, selectedTramo],
  );
  const tramoListed = tramoMembers.length > 0;
  const activeTramo = tramoListed ? selectedTramo : null;
  const activeTramoLabel = tramoListed ? (currentTramoOf(tramoMembers[0])?.name ?? NO_TRAMO_LABEL) : null;
  useEffect(() => {
    if (selectedTramo !== null && !tramoListed) selectKpi(null);
  }, [selectedTramo, tramoListed, selectKpi]);

  const visible = useMemo(() => searchProjects(listed, search), [listed, search]);
  const shown = useMemo(() => filterByTramo(visible, activeTramo), [visible, activeTramo]);
  const rows = useMemo(() => esencialProjectRows(shown, rowsById, tramoOrder), [shown, rowsById, tramoOrder]);
  const tramoNames = useMemo(() => new Map(shown.map((p) => [p.id, currentTramoOf(p)?.name ?? null])), [shown]);

  // The pill set comes from every listed project (stable while typing); counts follow the search.
  const pills = useMemo<PillWithColor[]>(() => {
    const counts = new Map(tramoPills(visible, tramoOrder).map((p) => [p.key, p.count]));
    return tramoPills(listed, tramoOrder).map((pill) => ({
      ...pill,
      count: pill.key === ALL_TRAMOS_KEY ? visible.length : (counts.get(pill.key) ?? 0),
      colorVar:
        pill.key === ALL_TRAMOS_KEY ? undefined : pill.key === NO_TRAMO_KEY ? "var(--muted-foreground)" : tramoColorVar(pill.key),
    }));
  }, [listed, visible, tramoOrder]);

  function handleSearch(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      replaceSearchParam(pathname, SEARCH_PARAM, value.trim() || null);
    }, SEARCH_DEBOUNCE_MS);
  }

  function openNew() {
    if (onNewProject) onNewProject();
    else replaceSearchParam(pathname, NEW_PROJECT_PARAM, "1");
  }

  const newButton = canCreateProject ? (
    <Button type="button" className="h-9 rounded-[10px] px-3.5 text-[13.5px] font-medium" onClick={openNew}>
      <Plus aria-hidden="true" />
      {ESENCIAL_NEW_PROJECT_LABEL}
    </Button>
  ) : null;

  const header = <PageHeader title={PROJECTS_TITLE} description={esencialDescription(listed.length)} actions={newButton} />;

  if (listed.length === 0) {
    return (
      <div className="flex flex-col gap-5" data-slot="projects-esencial">
        {header}
        <EmptyState
          icon={FolderKanban}
          title={ESENCIAL_EMPTY_TITLE}
          description={canCreateProject ? "Crea el primero para empezar a darle seguimiento." : undefined}
          action={canCreateProject ? { label: ESENCIAL_NEW_PROJECT_LABEL, onClick: openNew } : undefined}
        />
      </div>
    );
  }

  const q = search.trim();
  return (
    <div className="flex flex-col gap-5" data-slot="projects-esencial">
      {header}
      <div className="flex flex-wrap items-center gap-2" data-slot="projects-esencial-filters">
        <TramoPills
          pills={pills}
          value={activeTramo ?? ALL_TRAMOS_KEY}
          onChange={(key) => selectKpi(key === ALL_TRAMOS_KEY ? null : key)}
        />
        <span aria-hidden="true" className="hidden flex-[1_1_24px] sm:block" />
        <label htmlFor={searchId} className="sr-only">
          {ESENCIAL_SEARCH_LABEL}
        </label>
        <InputGroup className="h-8 w-full rounded-[10px] sm:w-auto">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id={searchId}
            type="search"
            value={search}
            placeholder={ESENCIAL_SEARCH_LABEL}
            className="text-[12.5px] sm:w-[190px] md:text-[12.5px]"
            onChange={(event) => handleSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && search) {
                event.preventDefault();
                handleSearch("");
              }
            }}
          />
        </InputGroup>
      </div>
      <p aria-live="polite" className="sr-only" data-slot="projects-esencial-count">
        {projectsCountText(rows.length)}
      </p>
      {rows.length === 0 ? (
        activeTramo && visible.length > 0 ? (
          <EmptyState
            title="Sin resultados"
            description={`Ningún proyecto de «${activeTramoLabel}» coincide con «${q}».`}
            action={{ label: ESENCIAL_CLEAR_TRAMO_LABEL, onClick: () => selectKpi(null) }}
          />
        ) : (
          <EmptyState title="Sin resultados" description={`Ningún proyecto coincide con «${q}».`} />
        )
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4"
          data-slot="projects-esencial-grid"
        >
          {rows.map((row, index) => (
            <ProjectCard
              key={row.id}
              row={row}
              tramoName={tramoNames.get(row.id) ?? null}
              index={index}
              actions={deleteProject.rowActions({ id: row.id, name: row.name })}
            />
          ))}
        </div>
      )}
      {deleteProject.dialog}
    </div>
  );
}
