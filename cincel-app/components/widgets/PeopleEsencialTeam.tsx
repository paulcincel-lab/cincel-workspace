"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Info, Search } from "lucide-react";

import { EmptyState } from "@/components/shell/EmptyState";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { EsencialItemRow } from "@/components/widgets/EsencialItemRow";
import { QuickAddRow, type QuickAddCreated, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { createUserTaskAction } from "@/lib/actions/tasks-actions";
import { areaTintClass } from "@/lib/areas/area-color";
import { zonedIsoDate } from "@/lib/dates/zoned-formatters";
import {
  LOAD_BUCKET_LABEL,
  absencesOf,
  filterTeam,
  loadBucket,
  personStatus,
  suggestAssignee,
  teamPillCounts,
  type LoadBucket,
  type PersonStatus,
  type TeamEstado,
  type TeamPill,
} from "@/lib/personas/team";
import {
  ESTADO_PARAM,
  PERSONA_PARAM,
  SEARCH_PARAM,
  parseEstadoParam,
  parsePersonaParam,
  replaceSearchParam,
} from "@/lib/personas/url-state";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogWorkflowsOptions } from "@/lib/query/options/catalog";
import { personasDetailOptions } from "@/lib/query/options/personas";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";
import { etapaColorSlot, etapaLabel } from "@/lib/etapas/compat";
import type { TaskDetail, UserTaskInput } from "@/lib/types/core";
import type { AttentionItem, PersonDatum } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Personas · Equipo in Esencial (frame `Personas-Esencial`): load pills and a
 * search, then one light card per person (status chip, open / overdue line
 * and a load meter). One card at a time expands to its open tasks
 * (`personas.detail(id)`, read only on expand) and a quick assign line that
 * creates a task for that person, with a hint to hand it to someone lighter
 * in the same etapa when the person would go over 100 %. Filter, search and
 * the expanded card live in the URL (`?estado=`, `?q=`, `?persona=`).
 *
 * Load is a task count (`occupancyPct` = open ÷ capacity); thresholds come
 * from `loadBucket` only.
 */
export type PeopleEsencialTeamProps = {
  people: PersonDatum[];
  /** `canCreateActivity`: quick assign and "+ Asignar una tarea…". */
  canCreateTask: boolean;
  /** `canChangeResponsible`: the "Asignar a {candidato}" suggestion. */
  canAssign: boolean;
  loading?: boolean;
  /** YYYY-MM-DD; defaults to today in the organization's time zone. */
  today?: string;
};

export const ESENCIAL_TEAM_FOOTNOTE =
  "Carga = tareas abiertas ÷ capacidad semanal. Libre < 60 % · Ocupado 60–79 % · Cargado 80–100 % · Saturado > 100 %.";

export const ESENCIAL_TEAM_EMPTY = "Aún no hay personas en el equipo";
export const ESENCIAL_TEAM_NO_MATCH = "Nadie coincide con este filtro.";

const SEARCH_DEBOUNCE_MS = 150;
const VISIBLE_TASKS = 4;

const PILLS: { key: TeamPill; label: string; dot: string | null }[] = [
  { key: "todos", label: "Todos", dot: null },
  { key: "libre", label: "Libres", dot: "bg-success" },
  { key: "cargado", label: "Cargados", dot: "bg-warning" },
  { key: "saturado", label: "Saturados", dot: "bg-destructive" },
  { key: "vacaciones", label: "Vacaciones", dot: "bg-chart-4" },
];

const BAR_FILL: Record<LoadBucket, string> = {
  libre: "bg-primary",
  ocupado: "bg-primary",
  cargado: "bg-warning",
  saturado: "bg-destructive",
};

const PCT_TEXT: Record<LoadBucket, string> = {
  libre: "text-primary",
  ocupado: "text-primary",
  cargado: "text-warning-ink",
  saturado: "text-destructive",
};

const CHIP_CLASS: Record<LoadBucket | "vacaciones", string> = {
  libre: "bg-success/14 text-success dark:bg-success/22",
  ocupado: "bg-secondary text-secondary-foreground",
  cargado: "bg-warning/14 text-warning-ink dark:bg-warning/22",
  saturado: "bg-destructive/14 text-destructive dark:bg-destructive/22",
  vacaciones: "bg-chart-4/14 text-[color:var(--chart-4-ink)] dark:bg-chart-4/22",
};

// ── Pure helpers (exported for tests) ───────────────────────────────────────

const DAY_MONTH = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" });

function isoToDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

function clean(text: string): string {
  return text.replace(/\./g, "").trim();
}

/** "13 nov". */
export function formatDayMonth(iso: string): string {
  return clean(DAY_MONTH.format(isoToDate(iso)));
}

/** "vie 13 nov". */
export function formatWeekdayDayMonth(iso: string): string {
  return `${clean(WEEKDAY.format(isoToDate(iso)))} ${formatDayMonth(iso)}`;
}

/** "12–16 nov" in one month, "28 nov–2 dic" across two. */
export function formatDayRange(from: string, to: string): string {
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8, 10))}–${formatDayMonth(to)}`;
  return `${formatDayMonth(from)}–${formatDayMonth(to)}`;
}

/** The chip of a person: bucket label, or the vacation copy (dates only when `absences` came). */
export function statusChipLabel(status: PersonStatus, withDates: boolean): string {
  if (status.kind === "bucket") return LOAD_BUCKET_LABEL[status.bucket];
  if (!withDates) return "De vacaciones";
  if (status.kind === "ausente") return `De vacaciones hasta el ${formatDayMonth(status.until)}`;
  return `Vacaciones ${formatDayRange(status.from, status.to)}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** The person's load after one more task (same capacity), when it can be derived. */
export function projectedPct(person: PersonDatum): number {
  const pct = person.occupancyPct ?? 0;
  if (person.open <= 0 || pct <= 0) return pct;
  return Math.round((pct * (person.open + 1)) / person.open);
}

function openText(n: number): string {
  return `${n} ${n === 1 ? "abierta" : "abiertas"}`;
}

function overdueText(n: number): string {
  if (n === 0) return "sin vencidas";
  return `${n} ${n === 1 ? "vencida" : "vencidas"}`;
}

function isOverdue(item: AttentionItem, today: string): boolean {
  return (item.daysLate ?? 0) > 0 || (item.due !== null && item.due.slice(0, 10) < today);
}

function taskItemFromCreated(task: TaskDetail): AttentionItem {
  return {
    id: task.id,
    title: task.title,
    href: `/tareas?tarea=${task.id}`,
    project: task.project?.name ?? "",
    etapa: task.workflow?.key ?? null,
    reason: "",
    tone: "default",
    assignee: null,
    due: task.commitmentDate ?? null,
    daysLate: null,
  };
}

function useToday(override: string | undefined): string {
  const { regional } = useGeneralSettings();
  return override ?? zonedIsoDate(new Date(), regional.timeZone);
}

// ── Widget ──────────────────────────────────────────────────────────────────

export function PeopleEsencialTeam({ people, canCreateTask, canAssign, loading = false, today: todayProp }: PeopleEsencialTeamProps) {
  const today = useToday(todayProp);
  const searchParams = useSearchParams();
  const searchId = useId();

  const [estado, setEstadoState] = useState<TeamEstado | null>(() => parseEstadoParam(searchParams.get(ESTADO_PARAM)));
  const [expandedId, setExpandedId] = useState<string | null>(() => parsePersonaParam(searchParams.get(PERSONA_PARAM)));
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get(SEARCH_PARAM) ?? "");
  const [query, setQuery] = useState(() => searchParams.get(SEARCH_PARAM) ?? "");
  const [focusQuickAddFor, setFocusQuickAddFor] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  function onSearchChange(value: string) {
    setSearchDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setQuery(value.trim());
      replaceSearchParam(SEARCH_PARAM, value.trim() || null);
    }, SEARCH_DEBOUNCE_MS);
  }

  function setEstado(next: TeamEstado | null) {
    setEstadoState(next);
    replaceSearchParam(ESTADO_PARAM, next);
  }

  function setExpanded(next: string | null, focusQuickAdd = false) {
    setExpandedId(next);
    setFocusQuickAddFor(focusQuickAdd ? next : null);
    replaceSearchParam(PERSONA_PARAM, next);
  }

  function clearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchDraft("");
    setQuery("");
    setEstadoState(null);
    replaceSearchParam(SEARCH_PARAM, null);
    replaceSearchParam(ESTADO_PARAM, null);
  }

  const counts = useMemo(() => teamPillCounts(people, today), [people, today]);
  const visible = useMemo(() => filterTeam(people, { estado, q: query }, today), [people, estado, query, today]);

  if (!loading && people.length === 0) return <EmptyState title={ESENCIAL_TEAM_EMPTY} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar por carga" className="flex flex-wrap gap-2">
          {PILLS.map((pill) => {
            const pressed = pill.key === "todos" ? estado === null : estado === pill.key;
            return (
              <Button
                key={pill.key}
                type="button"
                size="sm"
                variant={pressed ? "default" : "outline"}
                aria-pressed={pressed}
                disabled={loading}
                className="h-8 gap-1.5 rounded-full px-3 text-[12.5px] font-medium"
                onClick={() => setEstado(pill.key === "todos" ? null : (pill.key as TeamEstado))}
              >
                {pill.dot ? <span aria-hidden="true" className={cn("size-2 rounded-full", pill.dot)} /> : null}
                {pill.label}
                <span className={cn("font-mono", !pressed && "text-muted-foreground")}>
                  {loading ? "—" : counts[pill.key]}
                </span>
              </Button>
            );
          })}
        </div>
        <div className="relative w-full sm:ml-auto sm:w-40">
          <label htmlFor={searchId} className="sr-only">
            Buscar persona
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Buscar persona"
            value={searchDraft}
            disabled={loading}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      {loading ? (
        <ul aria-label="Cargando personas" className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-[132px] rounded-lg motion-reduce:animate-none" />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-card px-6 py-10 text-center text-card-foreground">
          <p className="text-sm">{ESENCIAL_TEAM_NO_MATCH}</p>
          <Button type="button" variant="link" size="sm" onClick={clearFilters}>
            Quitar filtros
          </Button>
        </div>
      ) : (
        <ul aria-label="Equipo" className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              people={people}
              today={today}
              expanded={expandedId === person.id}
              span={visible.length > 1}
              focusQuickAdd={focusQuickAddFor === person.id}
              canCreateTask={canCreateTask}
              canAssign={canAssign}
              onToggle={(focusQuickAdd) =>
                setExpanded(expandedId === person.id && !focusQuickAdd ? null : person.id, focusQuickAdd)
              }
              onCollapse={() => setExpanded(null)}
              onQuickAddFocused={() => setFocusQuickAddFor(null)}
            />
          ))}
        </ul>
      )}

      <p className="text-[12.5px] text-muted-foreground">{ESENCIAL_TEAM_FOOTNOTE}</p>
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

type PersonCardProps = {
  person: PersonDatum;
  people: PersonDatum[];
  today: string;
  expanded: boolean;
  span: boolean;
  focusQuickAdd: boolean;
  canCreateTask: boolean;
  canAssign: boolean;
  onToggle(focusQuickAdd: boolean): void;
  onCollapse(): void;
  onQuickAddFocused(): void;
};

function PersonCard({
  person,
  people,
  today,
  expanded,
  span,
  focusQuickAdd,
  canCreateTask,
  canAssign,
  onToggle,
  onCollapse,
  onQuickAddFocused,
}: PersonCardProps) {
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [created, setCreated] = useState<AttentionItem[]>([]);

  const status = personStatus(person, today);
  const pct = person.occupancyPct ?? 0;
  const bucket = loadBucket(pct);
  const shown = Math.max(0, Math.min(pct, 100));
  const name = firstName(person.name);
  const chipKey = status.kind === "bucket" ? status.bucket : "vacaciones";
  const meta = [person.puesto ?? null, person.etapa ? etapaLabel(person.etapa) : null].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!expanded || !focusQuickAdd) return;
    bodyRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    onQuickAddFocused();
  }, [expanded, focusQuickAdd, onQuickAddFocused]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !expanded || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    // Escape in a quick add with text clears it; only an empty line collapses the card.
    if (target instanceof HTMLInputElement && target.value !== "") return;
    event.preventDefault();
    onCollapse();
    toggleRef.current?.focus();
  }

  return (
    <li className={cn("min-w-0", expanded && span && "sm:col-span-2")}>
      <article
        aria-label={person.name}
        onKeyDown={onKeyDown}
        className={cn(
          "flex flex-col gap-3 rounded-lg border bg-card px-5 py-[18px] text-card-foreground shadow-sm",
          status.kind === "ausente" && "opacity-[0.85]",
          expanded && "anim-in",
        )}
      >
        <header className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              areaTintClass(person.etapa ? etapaColorSlot(person.etapa) : null),
            )}
          >
            {person.initials}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            {person.href ? (
              <Link
                href={person.href}
                title={person.name}
                className="truncate text-[15px] font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {person.name}
              </Link>
            ) : (
              <span title={person.name} className="truncate text-[15px] font-semibold">
                {person.name}
              </span>
            )}
            {meta ? (
              <span title={meta} className="truncate text-[12.5px] text-muted-foreground">
                {meta}
              </span>
            ) : null}
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-[3px] text-xs font-medium", CHIP_CLASS[chipKey])}>
            {statusChipLabel(status, absencesOf(person) !== null)}
          </span>
          <Button
            ref={toggleRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={`Tareas de ${person.name}`}
            onClick={() => onToggle(false)}
          >
            <ChevronDown aria-hidden="true" className={cn(expanded && "rotate-180")} />
          </Button>
        </header>

        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span>
            {openText(person.open)}
            {" · "}
            <span className={person.overdue > 0 ? "text-destructive" : "text-muted-foreground"}>
              {overdueText(person.overdue)}
            </span>
          </span>
          <span className={cn("font-mono text-[12.5px]", PCT_TEXT[bucket])}>
            {expanded ? `${pct} % de carga` : `${pct} %`}
          </span>
        </div>

        <div
          role="meter"
          aria-label={`Carga ${pct} %`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shown}
          aria-valuetext={`Carga ${pct} %`}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full", BAR_FILL[bucket])} style={{ width: `${shown}%` }} />
        </div>

        <div id={panelId} ref={bodyRef} hidden={!expanded}>
          {expanded ? (
            <ExpandedBody
              person={person}
              people={people}
              today={today}
              created={created}
              canCreateTask={canCreateTask}
              canAssign={canAssign}
              onCreated={(item) => setCreated((prev) => [item, ...prev])}
            />
          ) : null}
        </div>

        {!expanded && canCreateTask ? (
          <button
            type="button"
            onClick={() => onToggle(true)}
            className="self-start text-left text-[12.5px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {`+ Asignar una tarea a ${name}…`}
          </button>
        ) : null}
      </article>
    </li>
  );
}

// ── Expanded: tasks + quick assign ──────────────────────────────────────────

type ExpandedBodyProps = {
  person: PersonDatum;
  people: PersonDatum[];
  today: string;
  created: AttentionItem[];
  canCreateTask: boolean;
  canAssign: boolean;
  onCreated(item: AttentionItem): void;
};

function ExpandedBody({ person, people, today, created, canCreateTask, canAssign, onCreated }: ExpandedBodyProps) {
  const detail = useQuery(personasDetailOptions(person.id));
  const name = firstName(person.name);
  const createdIds = new Set(created.map((c) => c.id));
  const tasks = (detail.data?.tasks ?? []).filter((t) => !createdIds.has(t.id));
  const rows = [...created, ...tasks].slice(0, Math.max(VISIBLE_TASKS, created.length));

  let list: ReactNode;
  if (detail.isPending) {
    list = (
      <div aria-label="Cargando tareas" className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-10 motion-reduce:animate-none" />
        ))}
      </div>
    );
  } else if (detail.isError) {
    list = (
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span>No pudimos cargar las tareas.</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void detail.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (rows.length === 0) {
    list = <p className="text-[13px] text-muted-foreground">{`${name} no tiene tareas abiertas.`}</p>;
  } else {
    list = (
      <ul aria-label={`Tareas abiertas de ${person.name}`} className="flex flex-col">
        {rows.map((item, i) => {
          const late = isOverdue(item, today);
          const slot = item.etapa ? etapaColorSlot(item.etapa) : null;
          return (
            <li key={item.id} className={cn("py-2.5 [&_a]:line-clamp-2", i > 0 && "border-t border-muted")}>
              <EsencialItemRow
                title={item.title}
                href={item.href}
                layout="inline"
                isNew={createdIds.has(item.id)}
                meta={[
                  ...(item.project ? [{ key: "project", label: item.project }] : []),
                  ...(item.etapa
                    ? [{ key: "etapa", label: etapaLabel(item.etapa), dot: slot ? `var(--chart-${slot})` : undefined }]
                    : []),
                  ...(createdIds.has(item.id) ? [{ key: "new", label: "Nueva" }] : []),
                ]}
                status={
                  item.due
                    ? { kind: "text", label: formatDayMonth(item.due), tone: late ? "destructive" : "muted" }
                    : { kind: "text", label: "Sin fecha", tone: "muted" }
                }
              />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {list}
      {person.open > VISIBLE_TASKS ? (
        <Link
          href={`/tareas?responsable=${person.id}`}
          className="self-start text-[12.5px] text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {`Ver las ${person.open} tareas de ${name} →`}
        </Link>
      ) : null}
      {canCreateTask ? (
        <QuickAssign person={person} people={people} today={today} canAssign={canAssign} onCreated={onCreated} />
      ) : null}
    </div>
  );
}

type QuickAssignProps = {
  person: PersonDatum;
  people: PersonDatum[];
  today: string;
  canAssign: boolean;
  onCreated(item: AttentionItem): void;
};

function QuickAssign({ person, people, today, canAssign, onCreated }: QuickAssignProps) {
  const [swapped, setSwapped] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const { data: workflows } = useQuery(catalogWorkflowsOptions());

  const candidate = useMemo(() => suggestAssignee(people, person, today), [people, person, today]);
  const overloaded = projectedPct(person) > 100;
  const hintVisible = overloaded && candidate !== null && !swapped;
  const assignee = swapped && candidate ? candidate : person;
  const etapaId = person.etapa ? (workflows?.find((w) => w.key === person.etapa)?.id ?? null) : null;

  const create = useActionMutation<UserTaskInput, TaskDetail>(createUserTaskAction, {
    invalidate: (vars: UserTaskInput) => [
      qk.personas.equipo(),
      qk.personas.detail(person.id),
      ...(vars.managerId && vars.managerId !== person.id ? [qk.personas.detail(vars.managerId)] : []),
      qk.tareas.all,
      qk.proyectos.tab(vars.projectId, "tareas"),
      qk.inicio(),
      qk.shell.badges(),
    ],
  });

  function swap() {
    if (!candidate) return;
    setSwapped(true);
    setAnnouncement(`Se asignará a ${candidate.name}`);
  }

  async function onCreate(draft: QuickAddDraft): Promise<QuickAddCreated> {
    if (!draft.projectId) throw new Error("INVALID");
    const managerId = swapped && candidate ? candidate.id : (draft.assigneeId ?? person.id);
    const task = await create.mutateAsync({
      projectId: draft.projectId,
      title: draft.title,
      workflowId: draft.etapaId ?? etapaId,
      managerId,
      commitmentDate: draft.dueDate,
      priority: draft.priority,
    });
    const owner = people.find((p) => p.id === managerId) ?? person;
    if (managerId === person.id) onCreated(taskItemFromCreated(task));
    setAnnouncement(`Tarea creada para ${owner.name}`);
    setSwapped(false);
    return { id: task.id, title: task.title };
  }

  function onKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || event.shiftKey || !hintVisible || !canAssign) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    event.stopPropagation();
    swap();
  }

  return (
    <div className="flex flex-col gap-2" onKeyDownCapture={onKeyDownCapture}>
      <div className="mx-3.5 mt-2.5 mb-3.5 flex items-center gap-2 rounded-md border border-secondary bg-sidebar px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <QuickAddRow
            variant="row"
            context={{
              label: `Asignar una tarea a ${assignee.name}`,
              projectId: null,
              etapaId,
              assigneeId: assignee.id,
              placeholder: `Asignar una tarea a ${firstName(assignee.name)}…`,
            }}
            onCreate={onCreate}
          />
        </div>
        <kbd className="shrink-0 rounded-sm border bg-card px-1.5 font-mono text-[11px] text-muted-foreground">Enter</kbd>
      </div>
      {hintVisible && candidate ? (
        <div className="anim-in mx-3.5 flex flex-wrap items-center gap-2 text-[12.5px]">
          <Info aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span>
            {`${firstName(person.name)} ya va al ${person.occupancyPct ?? 0} %. ${firstName(candidate.name)} está al ${
              candidate.occupancyPct ?? 0
            } % en ${person.etapa ? etapaLabel(person.etapa) : ""}.`}
          </span>
          {canAssign ? (
            <Button type="button" variant="secondary" size="sm" className="rounded-full" onClick={swap}>
              {`Asignar a ${firstName(candidate.name)} · Tab`}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
