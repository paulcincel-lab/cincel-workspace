"use client";

import { ChevronDown, Info } from "lucide-react";
import { Fragment, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { FilterCard, type FilterGroup } from "@/components/widgets/FilterCard";
import type { Group } from "@/components/widgets/GroupedTable";
import { KpiStrip, type KpiStripItem } from "@/components/widgets/KpiStrip";
import { QuickAddRow, type QuickAddCreated, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import {
  availabilityText,
  filterTeamAnalitico,
  impactPct,
  isAbsentToday,
  isAbsentWeek,
  isOverloaded,
  loadBucket,
  personStatus,
  plusDays,
  roundedAverage,
  shortDay,
  SIN_ETAPA,
  suggestAssignee,
  teamFilterCounts,
  teamWeekStarts,
  TEAM_ANALITICO_DEFAULT_FILTERS,
  etapaGroups,
  weekLabel,
  type LoadBucket,
  type PersonRow,
} from "@/lib/personas/team";
import type { AnaliticoTeamUrlState } from "@/lib/personas/url-state";
import { parseQuickAdd, type QuickAddParseContext } from "@/lib/quick-add/parse";
import { etapaColorVar, etapaLabel } from "@/lib/etapas/compat";
import type { WorkflowRef } from "@/lib/types/core";
import type { PersonProjectLoad } from "@/lib/types/redesign";
import type { PersonDatum } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Personas · Analítico (frame `Personas-Analitico`): filter card with real
 * counts, KPI strip, "Ir a" anchors and one grouped table etapa → persona →
 * proyecto with the 4-week capacity, quick assign and totals. Carga is a task
 * count (`open ÷ capacity`), never hours. The filters and expanded state come
 * from `state` (kept in the URL by the caller).
 */
export type PeopleTeamAnaliticoProps = {
  /** The whole loaded team; filters apply here. */
  people: PersonDatum[];
  /** Active etapas in order. */
  etapas: WorkflowRef[];
  /** `YYYY-MM-DD`, org time zone. */
  today: string;
  state: AnaliticoTeamUrlState;
  onStateChange(patch: Partial<AnaliticoTeamUrlState>): void;
  canCreateTask: boolean;
  canAssign: boolean;
  /** Creates the drafted task for `assignee`. */
  onCreateTask?(assignee: PersonDatum, draft: QuickAddDraft): Promise<QuickAddCreated>;
  loading?: boolean;
};

export const TEAM_TABLE_LABEL = "Personas por etapa";
export const NO_MATCH_TEXT = "Nadie coincide con estos filtros.";
const COLUMN_COUNT = 10;

// ── Pure helpers (exported for tests) ───────────────────────────────────────

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function pctText(n: number | null): string {
  return n === null ? "—" : `${n} %`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** The 5 KPI tiles over the filtered rows. */
export function teamAnaliticoKpis(rows: PersonDatum[], today: string): KpiStripItem[] {
  const areas = new Set(rows.flatMap((p) => (p.etapa ? [p.etapa] : []))).size;
  const avg = roundedAverage(rows.map((p) => p.occupancyPct ?? 0));
  const zeroCapacity = rows.filter((p) => p.capacity === 0).length;
  const overloaded = rows.filter(isOverloaded).length;
  const cargado = rows.filter((p) => loadBucket(p.occupancyPct ?? 0) === "cargado").length;
  const overdue = rows.reduce((n, p) => n + p.overdue, 0);
  const topOverdue = rows.reduce<PersonDatum | null>((top, p) => (p.overdue > (top?.overdue ?? 0) ? p : top), null);
  const absent = rows.filter((p) => isAbsentToday(p, today)).length;
  const horizon = plusDays(today, 27);
  let next: { name: string; from: string } | null = null;
  for (const p of rows) {
    for (const a of p.absences ?? []) {
      if (a.from > today && a.from <= horizon && (!next || a.from < next.from)) next = { name: p.name, from: a.from };
    }
  }
  return [
    { key: "personas", label: "Personas", value: rows.length, secondary: plural(areas, "área", "áreas") },
    {
      key: "carga",
      label: "Carga promedio",
      value: pctText(avg),
      ...(zeroCapacity > 0 ? { secondary: `${plural(zeroCapacity, "persona", "personas")} con capacidad 0` } : {}),
    },
    {
      key: "sobrecargadas",
      label: "Sobrecargadas",
      value: overloaded,
      tone: overloaded > 0 ? "destructive" : "default",
      secondary: `${cargado} más arriba de 80 %`,
    },
    {
      key: "vencidas",
      label: "Vencidas",
      value: overdue,
      tone: overdue > 0 ? "destructive" : "default",
      ...(overdue > 0 && topOverdue ? { secondary: `${topOverdue.overdue} de ${topOverdue.name}` } : {}),
    },
    {
      key: "vacaciones",
      label: "En vacaciones",
      value: absent,
      secondary: next ? `${next.name} sale el ${shortDay(next.from)}` : "Nadie sale pronto",
    },
  ];
}

export type TeamFooter = {
  label: string;
  open: number;
  overdue: number;
  load: string;
  weeks: string[];
  summary: string;
};

/** Footer of the table: sums, average load and per-week averages without whole-week absences. */
export function teamFooter(rows: PersonDatum[], weekCount = 4): TeamFooter {
  const weeks = Array.from({ length: weekCount }, (_, i) =>
    pctText(
      roundedAverage(
        rows.flatMap((p) => {
          const week = p.weeks?.[i];
          return week && !isAbsentWeek(week) ? [week.occupancyPct] : [];
        }),
      ),
    ),
  );
  const libres = rows.filter((p) => loadBucket(p.occupancyPct ?? 0) === "libre").length;
  const saturadas = rows.filter((p) => loadBucket(p.occupancyPct ?? 0) === "saturado").length;
  return {
    label: `Total · ${plural(rows.length, "persona", "personas")}`,
    open: rows.reduce((n, p) => n + p.open, 0),
    overdue: rows.reduce((n, p) => n + p.overdue, 0),
    load: pctText(roundedAverage(rows.map((p) => p.occupancyPct ?? 0))),
    weeks,
    summary: `${plural(libres, "libre", "libres")} · ${plural(saturadas, "saturada", "saturadas")}`,
  };
}

// ── Token classes ───────────────────────────────────────────────────────────

const TINT = {
  warning:
    "bg-[color-mix(in_oklab,var(--warning)_14%,var(--card))] dark:bg-[color-mix(in_oklab,var(--warning)_22%,var(--card))] text-[color:var(--warning)]",
  destructive:
    "bg-[color-mix(in_oklab,var(--destructive)_14%,var(--card))] dark:bg-[color-mix(in_oklab,var(--destructive)_22%,var(--card))] text-destructive",
  success:
    "bg-[color-mix(in_oklab,var(--success)_14%,var(--card))] dark:bg-[color-mix(in_oklab,var(--success)_22%,var(--card))] text-[color:var(--success)]",
  vacation:
    "bg-[color-mix(in_oklab,var(--chart-4)_14%,var(--card))] dark:bg-[color-mix(in_oklab,var(--chart-4)_22%,var(--card))] text-[color:var(--chart-4-ink)]",
  muted: "bg-muted text-foreground",
} as const;

const HEAT_CLASS: Partial<Record<LoadBucket, string>> = { cargado: TINT.warning, saturado: TINT.destructive };

const BUCKET_TEXT: Record<LoadBucket, string> = {
  libre: "text-foreground",
  ocupado: "text-foreground",
  cargado: "text-[color:var(--warning)]",
  saturado: "text-destructive",
};

const TH = "px-3 py-2 font-mono text-[11px] font-medium tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase";
const TD = "border-b border-accent px-3 py-[7px] whitespace-nowrap";
const NUM = "text-right font-mono";

function statusChip(person: PersonDatum, today: string): { text: string; className: string } {
  const status = personStatus(person, today);
  const text = availabilityText(person, today);
  if (status.kind !== "bucket") return { text, className: TINT.vacation };
  const byBucket: Record<LoadBucket, string> = {
    libre: TINT.success,
    ocupado: TINT.muted,
    cargado: TINT.warning,
    saturado: TINT.destructive,
  };
  return { text, className: byBucket[status.bucket] };
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Dot({ color, size = 8 }: { color?: string; size?: 7 | 8 }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-full", size === 7 ? "size-[7px]" : "size-2", !color && "bg-muted-foreground")}
      style={color ? { background: color } : undefined}
    />
  );
}

function HeatCell({ pct, absent }: { pct: number | null; absent?: boolean }) {
  if (absent) {
    return (
      <td className={cn(TD, NUM, TINT.vacation)}>
        <span aria-hidden="true">Vac.</span>
        <span className="sr-only">vacaciones toda la semana</span>
      </td>
    );
  }
  if (pct === null) return <td className={cn(TD, NUM, "text-muted-foreground")}>—</td>;
  return <td className={cn(TD, NUM, HEAT_CLASS[loadBucket(pct)])}>{`${pct} %`}</td>;
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={cn("size-3 rounded-sm", TINT.warning)} />
        80–100 % cargado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={cn("size-3 rounded-sm", TINT.destructive)} />
        más de 100 % saturado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={cn("size-3 rounded-sm", TINT.vacation)} />
        Vac. vacaciones
      </span>
      <span>Carga = tareas abiertas de la semana ÷ capacidad semanal.</span>
    </div>
  );
}

type GroupHeaderProps = {
  group: Group<PersonRow>;
  expanded: boolean;
  onToggle(): void;
};

function GroupHeaderRow({ group, expanded, onToggle }: GroupHeaderProps) {
  const metric = (key: string) => group.metrics.find((m) => m.key === key);
  const open = metric("abiertas")?.value ?? "0";
  const overdue = metric("vencidas");
  const load = metric("carga");
  return (
    <tr id={`a-${group.id}`} className="scroll-mt-4">
      <td colSpan={COLUMN_COUNT} className="border-b border-border bg-muted p-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`g-${group.id}-rows`}
          onClick={onToggle}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn("chev size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", !expanded && "-rotate-90")}
          />
          <Dot color={group.color} />
          <span>{group.label}</span>{" "}
          <span className="font-mono font-normal text-muted-foreground">{group.caption}</span>{" "}
          <span className="flex-1" />
          <span className="font-mono font-normal text-foreground">
            {`${open} abiertas · `}
            <span className={overdue?.tone === "destructive" ? "text-destructive" : undefined}>{`${overdue?.value ?? "0"} vencidas`}</span>
            {" · carga "}
            <span
              className={
                load?.tone === "destructive" ? "text-destructive" : load?.tone === "warning" ? "text-[color:var(--warning)]" : undefined
              }
            >
              {load?.value ?? "0 %"}
            </span>
          </span>
        </button>
      </td>
    </tr>
  );
}

type PersonRowProps = {
  person: PersonRow;
  today: string;
  expanded: boolean;
  controls: string;
  onToggle(): void;
};

function PersonTableRow({ person, today, expanded, controls, onToggle }: PersonRowProps) {
  const chip = statusChip(person, today);
  const canExpand = person.open > 0 && person.projects.length > 0;
  return (
    <tr className="hover:bg-muted/50">
      <th scope="row" className={cn(TD, "sticky left-0 z-[1] bg-card pl-3 text-left font-normal")}>
        <span className="flex items-center gap-2">
          {canExpand ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={controls}
              aria-label={`${expanded ? "Contraer" : "Expandir"} ${person.name}`}
              onClick={onToggle}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn("chev size-3.5 transition-transform motion-reduce:transition-none", !expanded && "-rotate-90")}
              />
            </button>
          ) : (
            <span aria-hidden="true" className="inline-block size-5 shrink-0" />
          )}
          <span
            aria-hidden="true"
            className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground"
          >
            {person.initials}
          </span>
          {person.href ? (
            <a
              href={person.href}
              title={person.name}
              className="max-w-[240px] truncate font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {person.name}
            </a>
          ) : (
            <span title={person.name} className="max-w-[240px] truncate font-semibold">
              {person.name}
            </span>
          )}
        </span>
      </th>
      <td className={cn(TD, "max-w-[200px] truncate")} title={person.puesto ?? undefined}>
        {person.puesto ?? "—"}
      </td>
      <td className={cn(TD, NUM)}>{person.open}</td>
      <td className={cn(TD, NUM, person.overdue > 0 && "text-destructive")}>{person.overdue}</td>
      <HeatCell pct={person.occupancyPct} />
      {[0, 1, 2, 3].map((i) => {
        const week = person.weeks[i];
        return <HeatCell key={i} pct={week ? week.occupancyPct : null} absent={isAbsentWeek(week)} />;
      })}
      <td className={TD}>
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs", chip.className)}>{chip.text}</span>
      </td>
    </tr>
  );
}

function ProjectTableRow({ id, project, newCount }: { id: string; project: PersonProjectLoad; newCount: number }) {
  const color = project.etapa ? etapaColorVar(project.etapa) : undefined;
  return (
    <tr id={id} className={cn("bg-muted", newCount > 0 && "row-new")}>
      <td className={cn(TD, "sticky left-0 z-[1] bg-muted pl-10")}>
        <span className="flex items-center gap-2">
          <Dot color={color} />
          <span title={project.name} className="max-w-[240px] truncate">
            {project.name}
          </span>
          {newCount > 0 ? (
            <span className="text-[11.5px] font-medium text-secondary-foreground">{`+${newCount} ${newCount === 1 ? "nueva" : "nuevas"}`}</span>
          ) : null}
        </span>
      </td>
      <td className={cn(TD, "text-muted-foreground")}>{project.etapa ? etapaLabel(project.etapa) : "Sin etapa"}</td>
      <td className={cn(TD, NUM)}>{project.open}</td>
      <td className={cn(TD, NUM, project.overdue > 0 && "text-destructive")}>{project.overdue}</td>
      <td className={cn(TD, NUM)}>{plural(project.open, "tarea", "tareas")}</td>
      {project.weeks.map((n, i) => (
        <td key={i} className={cn(TD, NUM, "text-muted-foreground")}>
          {n === 0 ? "—" : n}
        </td>
      ))}
      <td className={TD} />
    </tr>
  );
}

// ── Widget ──────────────────────────────────────────────────────────────────

export function PeopleTeamAnalitico({
  people,
  etapas,
  today,
  state,
  onStateChange,
  canCreateTask,
  canAssign,
  onCreateTask,
  loading = false,
}: PeopleTeamAnaliticoProps) {
  const [draft, setDraft] = useState<{ personId: string; text: string } | null>(null);
  const [quickAddKey, setQuickAddKey] = useState(0);
  const [newTasks, setNewTasks] = useState<Record<string, number>>({});
  const [assigning, setAssigning] = useState(false);

  const orderedEtapas = useMemo(
    () => [...etapas].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es")),
    [etapas],
  );
  const filtered = useMemo(() => filterTeamAnalitico(people, state, today), [people, state, today]);
  const counts = useMemo(() => teamFilterCounts(people, state, today), [people, state, today]);
  const groups = useMemo(() => etapaGroups(filtered, orderedEtapas), [filtered, orderedEtapas]);
  const weekStarts = useMemo(() => teamWeekStarts(people, today), [people, today]);
  const expandedGroups = new Set(state.abiertos ?? groups.map((g) => g.id));
  const parseContext: QuickAddParseContext = useMemo(
    () => ({
      today,
      people: people.map((p) => ({ id: p.id, name: p.name })),
      etapas: orderedEtapas.map((t) => ({ id: t.id, key: t.key, name: t.name })),
      meId: null,
    }),
    [people, orderedEtapas, today],
  );

  const filterGroups: FilterGroup[] = [
    {
      id: "estado",
      label: "Estado",
      value: state.estado,
      options: [
        { value: "todas", label: "Todas", count: counts.estado.todas },
        { value: "sobrecargadas", label: "Sobrecargadas", count: counts.estado.sobrecargadas, tone: "destructive" },
        { value: "con-capacidad", label: "Con capacidad", count: counts.estado["con-capacidad"] },
      ],
    },
    {
      id: "etapa",
      label: "Etapa",
      value: state.etapa ?? "todos",
      options: [
        { value: "todos", label: "Todos", count: counts.etapa.todos ?? 0 },
        ...orderedEtapas.map((t) => ({
          value: t.key,
          label: t.name,
          count: counts.etapa[t.key] ?? 0,
          color: etapaColorVar(t.key, t.sortOrder),
        })),
        ...((counts.etapa[SIN_ETAPA] ?? 0) > 0 || state.etapa === SIN_ETAPA
          ? [{ value: SIN_ETAPA, label: "Sin etapa", count: counts.etapa[SIN_ETAPA] ?? 0 }]
          : []),
      ],
    },
    {
      id: "alcance",
      label: "Alcance",
      value: state.alcance,
      options: [
        { value: "todo", label: "Todo el equipo", count: counts.alcance.todo },
        { value: "mi-equipo", label: "Solo mi equipo", count: counts.alcance["mi-equipo"] },
      ],
    },
  ];

  function onFilterChange(groupId: string, value: string) {
    if (groupId === "estado") onStateChange({ estado: value as AnaliticoTeamUrlState["estado"] });
    else if (groupId === "etapa") onStateChange({ etapa: value === "todos" ? null : value });
    else if (groupId === "alcance") onStateChange({ alcance: value === "mi-equipo" ? "mi-equipo" : "todo" });
  }

  const filtersCard = (
    <fieldset disabled={loading} className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">Filtros de personas</legend>
      <FilterCard
        groups={filterGroups}
        onChange={onFilterChange}
        search={{
          value: state.q,
          onChange: (q) => onStateChange({ q }),
          placeholder: "Buscar personas",
          label: "Buscar personas",
        }}
      />
    </fieldset>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {filtersCard}
        <LoadingSkeleton variant="kpis" rows={5} />
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  function toggleGroup(id: string) {
    const next = new Set(expandedGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const ids = groups.map((g) => g.id).filter((g) => next.has(g));
    onStateChange({ abiertos: ids.length === groups.length ? null : ids });
  }

  function togglePerson(id: string) {
    onStateChange({ persona: state.persona === id ? null : id });
    if (draft && draft.personId !== id) setDraft(null);
  }

  function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    if (!expandedGroups.has(id)) {
      const ids = groups.map((g) => g.id).filter((g) => g === id || expandedGroups.has(g));
      onStateChange({ abiertos: ids.length === groups.length ? null : ids });
    }
    const row = typeof document === "undefined" ? null : document.getElementById(`a-${id}`);
    if (!row) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
    row.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus({ preventScroll: true });
  }

  function markNew(personId: string, projectId: string | null) {
    if (!projectId) return;
    const key = `${personId}:${projectId}`;
    setNewTasks((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  }

  function onTableInput(event: FormEvent<HTMLTableElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !state.persona) return;
    setDraft({ personId: state.persona, text: target.value });
  }

  async function createFor(assignee: PersonDatum, value: QuickAddDraft): Promise<QuickAddCreated> {
    if (!onCreateTask) throw new Error("FORBIDDEN");
    const created = await onCreateTask(assignee, value);
    markNew(assignee.id, value.projectId);
    return created;
  }

  function quickAssignRows(person: PersonRow, rowIds: string[]): ReactNode {
    if (!canCreateTask || !onCreateTask) return null;
    const project = person.projects[0];
    const etapaId = project?.etapa ? (orderedEtapas.find((t) => t.key === project.etapa)?.id ?? null) : null;
    const text = draft?.personId === person.id ? draft.text : "";
    const parsed = text.trim() && !text.trim().startsWith("/") ? parseQuickAdd(text, parseContext) : null;
    const dueDate = parsed?.dueDate ?? null;
    const impact = parsed?.title ? impactPct(person, dueDate, weekStarts) : null;
    const candidate = impact ? suggestAssignee(people, person, today) : null;
    const candidateImpact = candidate ? impactPct(candidate, dueDate, weekStarts) : null;
    const draftFor = (assigneeId: string): QuickAddDraft => ({
      title: parsed?.title ?? text.trim(),
      projectId: project?.projectId ?? null,
      etapaId: parsed?.etapaId ?? etapaId,
      assigneeId,
      dueDate,
      priority: parsed?.priority ?? "media",
    });

    async function assignToCandidate() {
      if (!candidate || assigning) return;
      setAssigning(true);
      try {
        await createFor(candidate, draftFor(candidate.id));
        setDraft(null);
        setQuickAddKey((k) => k + 1);
      } finally {
        setAssigning(false);
      }
    }

    return (
      <>
        <QuickAddRow
          key={`${person.id}-${quickAddKey}`}
          variant="row"
          colSpan={COLUMN_COUNT}
          context={{
            label: `Asignar tarea a ${person.name}`,
            projectId: project?.projectId ?? null,
            etapaId,
            assigneeId: person.id,
          }}
          onCreate={async (value) => {
            const assignee = people.find((p) => p.id === (value.assigneeId ?? person.id)) ?? person;
            const previous = draft;
            setDraft(null);
            try {
              return await createFor(assignee, { ...value, assigneeId: value.assigneeId ?? person.id });
            } catch (error) {
              setDraft(previous);
              throw error;
            }
          }}
        />
        <tr id={rowIds[rowIds.length - 1]}>
          <td colSpan={COLUMN_COUNT} className="border-b border-accent pt-1.5 pr-3 pb-2 pl-11">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="font-mono text-[11px] text-muted-foreground">Enter crea · Tab acepta</span>
              {impact ? (
                <span className="anim-in inline-flex flex-wrap items-center gap-2" aria-live="polite">
                  <Info aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  <span>
                    {`Lleva la semana ${weekLabel(weekStarts[impact.week]!)} de ${firstName(person.name)} al ${impact.pct} %.`}
                    {candidate && candidateImpact ? ` ${firstName(candidate.name)} queda al ${candidateImpact.pct} %.` : null}
                  </span>
                  {candidate && canAssign ? (
                    <Button type="button" size="sm" variant="secondary" className="rounded-full" disabled={assigning} onClick={assignToCandidate}>
                      {`Asignar a ${firstName(candidate.name)}`}
                    </Button>
                  ) : null}
                </span>
              ) : null}
            </div>
          </td>
        </tr>
      </>
    );
  }

  const footer = teamFooter(filtered);
  const hasFilters =
    state.estado !== "todas" || state.etapa !== null || state.alcance !== "todo" || state.q.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      {filtersCard}
      <KpiStrip items={teamAnaliticoKpis(filtered, today)} />

      {groups.length > 0 ? (
        <nav aria-label="Ir a área" className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Ir a</span>
          {groups.map((group) => {
            const avg = roundedAverage(group.rows?.map((r) => r.occupancyPct) ?? []) ?? 0;
            return (
              <a
                key={group.id}
                href={`#a-${group.id}`}
                onClick={(event) => jumpTo(event, group.id)}
                className="inline-flex h-[30px] items-center gap-2 rounded-md border border-border bg-card px-3 text-[12.5px] font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Dot color={group.color} size={7} />
                {group.label}
                <span className={cn("font-mono", BUCKET_TEXT[loadBucket(avg)])}>{`${avg} %`}</span>
              </a>
            );
          })}
          <span className="text-xs text-muted-foreground">(carga promedio)</span>
          <span className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={() => onStateChange({ abiertos: null })}>
            Expandir todo
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onStateChange({ abiertos: [], persona: null })}>
            Contraer todo
          </Button>
        </nav>
      ) : null}

      <Card className="gap-0 overflow-hidden py-0">
        <div className="overflow-x-auto">
          <table aria-label={TEAM_TABLE_LABEL} onInput={onTableInput} className="w-full min-w-[1040px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th scope="col" className={cn(TH, "sticky left-0 z-[2] bg-muted pl-11 text-left")}>
                  Persona
                </th>
                <th scope="col" className={cn(TH, "text-left")}>
                  Puesto
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  Abiertas
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  Vencidas
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  Carga
                </th>
                {weekStarts.map((monday) => (
                  <th key={monday} scope="col" className={cn(TH, "text-right normal-case")}>
                    {weekLabel(monday)}
                  </th>
                ))}
                <th scope="col" className={cn(TH, "text-left")}>
                  Disponibilidad
                </th>
              </tr>
            </thead>

            {groups.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-3 py-6 text-center text-muted-foreground">
                    <span>{NO_MATCH_TEXT}</span>{" "}
                    {hasFilters ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() =>
                          onStateChange({
                            estado: TEAM_ANALITICO_DEFAULT_FILTERS.estado,
                            etapa: TEAM_ANALITICO_DEFAULT_FILTERS.etapa,
                            alcance: TEAM_ANALITICO_DEFAULT_FILTERS.alcance,
                            q: TEAM_ANALITICO_DEFAULT_FILTERS.q,
                          })
                        }
                      >
                        Quitar filtros
                      </Button>
                    ) : null}
                  </td>
                </tr>
              </tbody>
            ) : (
              groups.map((group) => {
                const open = expandedGroups.has(group.id);
                return (
                  <Fragment key={group.id}>
                    <tbody>
                      <GroupHeaderRow group={group} expanded={open} onToggle={() => toggleGroup(group.id)} />
                    </tbody>
                    <tbody id={`g-${group.id}-rows`} hidden={!open}>
                      {open
                        ? (group.rows ?? []).map((person) => {
                            const expanded = state.persona === person.id && person.projects.length > 0;
                            const rowIds = [
                              ...person.projects.map((p) => `p-${person.id}-${p.projectId}`),
                              // The quick-assign row exists only for those who may create tasks.
                              ...(canCreateTask && onCreateTask ? [`p-${person.id}-asignar`] : []),
                            ];
                            return (
                              <Fragment key={person.id}>
                                <PersonTableRow
                                  person={person}
                                  today={today}
                                  expanded={expanded}
                                  controls={rowIds.join(" ")}
                                  onToggle={() => togglePerson(person.id)}
                                />
                                {expanded
                                  ? person.projects.map((project, i) => (
                                      <ProjectTableRow
                                        key={project.projectId}
                                        id={rowIds[i]!}
                                        project={project}
                                        newCount={newTasks[`${person.id}:${project.projectId}`] ?? 0}
                                      />
                                    ))
                                  : null}
                                {expanded ? quickAssignRows(person, rowIds) : null}
                              </Fragment>
                            );
                          })
                        : null}
                    </tbody>
                  </Fragment>
                );
              })
            )}

            <tfoot>
              <tr className="bg-muted text-[12.5px] font-semibold">
                <td className="sticky left-0 z-[1] bg-muted px-3 py-2 pl-11 whitespace-nowrap">{footer.label}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right font-mono">{footer.open}</td>
                <td className={cn("px-3 py-2 text-right font-mono", footer.overdue > 0 && "text-destructive")}>{footer.overdue}</td>
                <td className="px-3 py-2 text-right font-mono">{footer.load}</td>
                {footer.weeks.map((value, i) => (
                  <td key={i} className="px-3 py-2 text-right font-mono">
                    {value}
                  </td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap">{footer.summary}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Legend />
    </div>
  );
}
