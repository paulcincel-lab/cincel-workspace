"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Plus, UserRound } from "lucide-react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { LOADING_LABEL } from "@/components/shell/LoadingSkeleton";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { EsencialItemRow, type EsencialMeta } from "@/components/widgets/EsencialItemRow";
import { QuickAddRow, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { tramoDot } from "@/components/widgets/esencial-tokens";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import type { TareasListFilters } from "@/lib/query/keys";
import {
  tareasByProjectOptions,
  tareasCompletedFilters,
  tareasEsencialFilters,
  tareasFacetsOptions,
  tareasListInfiniteOptions,
} from "@/lib/query/options/tareas";
import { formatDueDate, isTaskLate } from "@/lib/proyectos/project-tasks-by-fase";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { useQuickAddRecent } from "@/lib/stores/quick-add-store";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { TAREAS_BY_PROJECT_LIMIT, type TareasFacets, type TareasProjectGroup } from "@/lib/tareas/page-data";
import {
  TAREAS_RESPONSABLE_TODOS,
  clearTareasFilters,
  esencialResponsable,
  hasEsencialFilters,
  isEsencialSoloMias,
  tareasHref,
  type TareasMostrar,
  type TareasQuery,
} from "@/lib/tareas/query";
import { ESTILO_PARAM } from "@/lib/ui/style-override";
import type { TaskListRow, WorkflowRef } from "@/lib/types/core";
import { cn } from "@/lib/utils";

import { useQuickAddCreate } from "./quick-add-create";
import { localIsoDate, taskDueDate } from "./tablero-table";
import {
  replaceTareasUrl,
  useTareasFilters,
  useTareasPage,
  useTareasPageReady,
  useTareasQuery,
} from "./use-tareas-page";

/**
 * Tareas · Esencial (frame `Lista-Esencial`, Estilos #987): the signed-in
 * user's tasks as one soft card per project. Header, the filter chips
 * (Mostrar, tramo, Solo mías), then `EsencialCard`s with `EsencialItemRow`s
 * (status last), a quick-add on the last line and the "N completadas"
 * disclosure, whose rows load on the first expand.
 *
 * Reads the URL like the other styles; a missing `responsable` is "yo"
 * (Solo mías on) and turning Solo mías off writes `responsable=todos`. Data:
 * `tareas.byProject(f)` (counts and open rows, cap 200) and
 * `tareas.facets(f)` (chip counts), both with the resolved filters
 * (`tareasEsencialFilters`), both seeded by the Esencial page bundle.
 */

export const ESENCIAL_EMPTY_FILTERED = "No hay tareas con estos filtros";
export const ESENCIAL_EMPTY_MINE = "No tienes tareas asignadas";
export const ESENCIAL_CLEAR_FILTERS = "Quitar filtros";
export const ESENCIAL_SEE_ALL = "Ver todas";
export const ESENCIAL_SOLO_MIAS = "Solo mías";
export const ESENCIAL_QUICK_ADD_PLACEHOLDER = "Escribe para agregar una tarea…";
export const ESENCIAL_CREATED_ANNOUNCEMENT = "Tarea creada";

const MOSTRAR_LABEL: Record<TareasMostrar, string> = {
  todas: "Todas",
  abiertas: "Abiertas",
  en_retraso: "En retraso",
};
const MOSTRAR_ORDER: readonly TareasMostrar[] = ["todas", "abiertas", "en_retraso"];

const NO_TRAMOS: WorkflowRef[] = [];

/** "Mis tareas por proyecto: lo que tienes asignado, Ana." (no name: without it). */
export function esencialDescription(firstName: string | null): string {
  return firstName
    ? `Mis tareas por proyecto: lo que tienes asignado, ${firstName}.`
    : "Mis tareas por proyecto: lo que tienes asignado.";
}

/** "1 tarea" / "N tareas". */
export function taskCountLabel(n: number): string {
  return n === 1 ? "1 tarea" : `${n} tareas`;
}

/** "1 en retraso" / "N en retraso". */
export function overdueLabel(n: number): string {
  return `${n} en retraso`;
}

/** "Mostrando 200 tareas. Ver todas en Analítico". */
export function truncatedNote(limit: number): string {
  return `Mostrando ${limit} tareas. Ver todas en Analítico`;
}

/** Card meta: "3 tareas · 1 en retraso" (the overdue part in destructive) or "3 tareas · al día". */
export function CardMeta({ group }: { group: Pick<TareasProjectGroup, "open" | "overdue"> }) {
  return (
    <>
      {taskCountLabel(group.open)} ·{" "}
      {group.overdue > 0 ? <span className="text-destructive">{overdueLabel(group.overdue)}</span> : "al día"}
    </>
  );
}

/** The current URL (style, filters) with `tarea=<id>`: `TaskSheetRoute` opens the sheet over the cards. */
export function taskSheetHrefFor(pathname: string, search: string, taskId: string): string {
  const params = new URLSearchParams(search);
  params.set("tarea", taskId);
  return `${pathname}?${params.toString()}`;
}

/** First word of the session user's name. */
function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** The meta items of a row: the tramo dot and name, then the due date (destructive when overdue). */
function rowMeta(row: TaskListRow, today: string): EsencialMeta[] {
  const meta: EsencialMeta[] = [];
  if (row.workflow) meta.push({ key: "tramo", label: row.workflow.name, dot: tramoDot(row.workflow) });
  const due = taskDueDate(row);
  if (due) {
    meta.push({
      key: "vence",
      label: formatDueDate(due),
      mono: true,
      tone: isTaskLate(row, today) ? "destructive" : "muted",
    });
  }
  return meta;
}

/** A chip of the filters row: h32, rounded, pressed in secondary (`aria-pressed`). */
function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : "outline"}
      size="sm"
      aria-pressed={pressed}
      data-state={pressed ? "on" : "off"}
      onClick={onClick}
      className="h-8 gap-1.5 rounded-full px-3 text-[12.5px] font-medium"
    >
      {children}
    </Button>
  );
}

function ChipCount({ value, destructive = false }: { value: number; destructive?: boolean }) {
  return (
    <span data-slot="chip-count" className={cn("font-mono tabular-nums", destructive ? "text-destructive" : "text-muted-foreground")}>
      {value}
    </span>
  );
}

function ChipDot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function ChipDivider() {
  return <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />;
}

/** Three 220 px card skeletons with three 36 px rows each. */
function CardsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={LOADING_LABEL}
      data-slot="esencial-skeleton"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-4"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-[220px] flex-col gap-2 rounded-lg border bg-card px-5 pt-[18px] pb-3.5">
          <Skeleton className="mb-2 h-4 w-1/2" />
          {[0, 1, 2].map((r) => (
            <Skeleton key={r} className="h-9 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The closed rows of one card, loaded once the disclosure first opens. */
function CompletedRows({
  filters,
  projectId,
  enabled,
  rowHref,
  today,
}: {
  filters: TareasListFilters;
  projectId: string;
  enabled: boolean;
  rowHref(id: string): string;
  today: string;
}) {
  const list = useInfiniteQuery({ ...tareasListInfiniteOptions(tareasCompletedFilters(filters, projectId)), enabled });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  if (!enabled) return null;
  if (list.isPending) return <p className="px-2.5 py-2 text-xs text-muted-foreground">{LOADING_LABEL}</p>;
  return (
    <>
      {rows.map((row) => (
        <EsencialItemRow
          key={row.id}
          title={row.title}
          href={rowHref(row.id)}
          meta={rowMeta(row, today)}
          status={{ kind: "task", value: { status: row.status, customStatus: row.customStatus } }}
        />
      ))}
      {list.hasNextPage ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Cargar más
        </Button>
      ) : null}
    </>
  );
}

function ProjectCard({
  group,
  index,
  filters,
  today,
  rowHref,
  quickAdd,
  newIds,
}: {
  group: TareasProjectGroup;
  index: number;
  filters: TareasListFilters;
  today: string;
  rowHref(id: string): string;
  quickAdd: ReactNode;
  newIds: ReadonlySet<string>;
}) {
  const [completedLoaded, setCompletedLoaded] = useState(false);
  return (
    <EsencialCard
      title={group.project.name}
      href={`/proyectos/${encodeURIComponent(group.project.id)}`}
      meta={<CardMeta group={group} />}
      index={index}
      completed={{
        count: group.completed,
        onOpenChange: (open) => {
          if (open) setCompletedLoaded(true);
        },
        children: (
          <CompletedRows
            filters={filters}
            projectId={group.project.id}
            enabled={completedLoaded}
            rowHref={rowHref}
            today={today}
          />
        ),
      }}
    >
      {group.rows.map((row) => (
        <EsencialItemRow
          key={row.id}
          title={row.title}
          href={rowHref(row.id)}
          meta={rowMeta(row, today)}
          status={{ kind: "task", value: { status: row.status, customStatus: row.customStatus } }}
          isNew={newIds.has(row.id)}
        />
      ))}
      {quickAdd}
    </EsencialCard>
  );
}

export function TareasEsencial() {
  const query = useTareasQuery();
  const urlFilters = useTareasFilters(query);
  const filters = useMemo(() => tareasEsencialFilters(urlFilters), [urlFilters]);
  const page = useTareasPage(query);
  const tramos = page.data?.tramos ?? NO_TRAMOS;

  // The page bundle seeds both keys: they wait for it, so a filter change sends one request.
  const ready = useTareasPageReady(query);
  const byProject = useQuery({ ...tareasByProjectOptions(filters), enabled: ready });
  const facetsQuery = useQuery({ ...tareasFacetsOptions(filters), enabled: ready });
  const facets: TareasFacets | undefined = facetsQuery.data;

  const user = useSessionStore(selectAuthenticatedUser);
  const capabilities = useMemo(() => resolveActivitiesCapabilities(user), [user]);
  const canCreate = capabilities.canCreateActivity;
  const meId = user?.member.id ?? null;
  const firstName = firstNameOf(user?.member.name);
  const openNewTask = useNewTaskUi((s) => s.openNewTask);

  const pathname = usePathname() ?? "/tareas";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const estilo = searchParams?.get(ESTILO_PARAM) ?? null;
  const today = localIsoDate();

  /** A Tareas href for `patch`, keeping a `?estilo=` preview. */
  const hrefFor = useCallback(
    (patch: Partial<TareasQuery>, estiloParam: string | null = estilo) => {
      const href = tareasHref({ ...query, nueva: false, ...patch });
      if (!estiloParam) return href;
      return `${href}${href.includes("?") ? "&" : "?"}${ESTILO_PARAM}=${encodeURIComponent(estiloParam)}`;
    },
    [query, estilo],
  );
  const replaceQuery = useCallback((patch: Partial<TareasQuery>) => replaceTareasUrl(hrefFor(patch)), [hrefFor]);
  const rowHref = useCallback((id: string) => taskSheetHrefFor(pathname, search, id), [pathname, search]);

  // ── Quick-add: creates in the card's project, assigned to me unless `@persona` says otherwise; the
  // tramo is `#tramo`, else the project's current one (resolved by `QuickAddRow`). The line shows the
  // pending row until the create settles; the real row then enters with `row-new`.
  const quickAdd = useQuickAddCreate();
  const recent = useQuickAddRecent((s) => s.recent);
  const newIds = useMemo<ReadonlySet<string>>(() => new Set(recent), [recent]);
  const [announcement, setAnnouncement] = useState("");
  const onCreate = useCallback(
    async (draft: QuickAddDraft) => {
      setAnnouncement("");
      const created = await quickAdd.create(draft);
      setAnnouncement(ESENCIAL_CREATED_ANNOUNCEMENT);
      return created;
    },
    [quickAdd],
  );

  // ── Filters.
  const soloMias = isEsencialSoloMias(query.responsable);
  const mostrarCounts = facets?.mostrar;
  const filtersRow = (
    <div role="group" aria-label="Filtros" className="flex flex-wrap items-center gap-2">
      {MOSTRAR_ORDER.map((m) => (
        <FilterChip key={m} pressed={query.mostrar === m} onClick={() => replaceQuery({ mostrar: m })}>
          {m === "en_retraso" ? <ChipDot color="var(--destructive)" /> : null}
          <span>{MOSTRAR_LABEL[m]}</span>
          {mostrarCounts ? <ChipCount value={mostrarCounts[m]} destructive={m === "en_retraso"} /> : null}
        </FilterChip>
      ))}
      {tramos.length > 0 ? <ChipDivider /> : null}
      {tramos.map((tramo) => (
        <FilterChip
          key={tramo.key}
          pressed={query.tramo === tramo.key}
          onClick={() => replaceQuery({ tramo: query.tramo === tramo.key ? null : tramo.key })}
        >
          <ChipDot color={tramoDot(tramo)} />
          <span>{tramo.name}</span>
          {facets ? <ChipCount value={facets.byTramo[tramo.key] ?? 0} /> : null}
        </FilterChip>
      ))}
      <ChipDivider />
      <FilterChip
        pressed={soloMias}
        onClick={() => replaceQuery({ responsable: soloMias ? TAREAS_RESPONSABLE_TODOS : null })}
      >
        <UserRound aria-hidden="true" className="size-[13px]" />
        <span>{ESENCIAL_SOLO_MIAS}</span>
      </FilterChip>
    </div>
  );

  // ── Header.
  const actions: ReactNode = canCreate ? (
    <Button
      onClick={() =>
        openNewTask({ projectId: query.proyecto ?? undefined, tramoKey: query.tramo ?? undefined }, "tareas")
      }
    >
      <Plus aria-hidden="true" data-icon="inline-start" />
      Nueva tarea
    </Button>
  ) : null;

  // ── Body: loading, error, empty or the cards.
  const filtered = hasEsencialFilters(query);
  const empty: EmptyStateProps = filtered
    ? {
        title: ESENCIAL_EMPTY_FILTERED,
        action: { label: ESENCIAL_CLEAR_FILTERS, onClick: () => replaceTareasUrl(hrefFor(clearTareasFilters())) },
      }
    : {
        title: ESENCIAL_EMPTY_MINE,
        action: { label: ESENCIAL_SEE_ALL, onClick: () => replaceQuery({ responsable: TAREAS_RESPONSABLE_TODOS }) },
      };

  let body: ReactNode;
  if (byProject.isPending) {
    body = <CardsSkeleton />;
  } else if (byProject.isError && !byProject.data) {
    body = <ErrorState title="No se pudo cargar" onRetry={() => void byProject.refetch()} />;
  } else if (!byProject.data || byProject.data.groups.length === 0) {
    body = <EmptyState {...empty} />;
  } else {
    const { groups, truncated } = byProject.data;
    // The analítico link keeps every filter, Esencial's "yo" default included.
    const analiticoHref = hrefFor({ responsable: esencialResponsable(query.responsable) }, "analitico");
    body = (
      <>
        <div
          data-slot="esencial-cards"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-4"
        >
          {groups.map((group, i) => (
            <ProjectCard
              key={group.project.id}
              group={group}
              index={i}
              filters={filters}
              today={today}
              rowHref={rowHref}
              newIds={newIds}
              quickAdd={
                canCreate ? (
                  <QuickAddRow
                    variant="row"
                    context={{
                      label: `Nueva tarea en ${group.project.name}`,
                      projectId: group.project.id,
                      assigneeId: meId,
                      placeholder: ESENCIAL_QUICK_ADD_PLACEHOLDER,
                    }}
                    onCreate={onCreate}
                  />
                ) : null
              }
            />
          ))}
        </div>
        {truncated ? (
          <p data-slot="esencial-truncated" className="text-[12.5px] text-muted-foreground">
            <Link href={analiticoHref} className="underline-offset-4 hover:underline">
              {truncatedNote(TAREAS_BY_PROJECT_LIMIT)}
            </Link>
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div data-slot="tareas-esencial" className="flex flex-col gap-5">
      <PageHeader title="Tareas" description={esencialDescription(firstName)} actions={actions} />
      {filtersRow}
      {body}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
