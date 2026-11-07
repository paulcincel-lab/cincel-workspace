"use client";

import type { ReactNode } from "react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { LoadBar } from "@/components/v2/status/LoadBar";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StyleView } from "@/components/widgets/StyleView";
import { TramoBadge } from "@/components/widgets/TramoBadge";
import { tramoLabel } from "@/lib/tramos/compat";
import type { WorkflowRef } from "@/lib/types/core";
import type { Availability, PersonDatum, RecordTableData } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * People in three styles (redesign FE §4.10.1, §15.3 "Personas"):
 * - Visual: availability grid + avatar cards (tramo chip, projects, load bar),
 *   or compact rows with an inline availability strip (`layout="rows"`).
 * - Esencial: directory list; availability as a sentence ("Libre jue y vie.").
 * - Analítico: `RecordTable` (abiertas, vencidas, horas, % ocupación heat,
 *   proyectos, averages row) plus a per-day availability table.
 *
 * `show` picks the optional facts; open/overdue counts are always shown. The
 * hours column/line appears only when the server returned hours for someone
 * (B4). `actions` renders a per-person slot (e.g. "Ver tareas", correo, Cutto).
 */
export type PeopleShow = "load" | "hours" | "availability" | "projects";

export type PeopleWidgetProps = {
  people: PersonDatum[];
  show: PeopleShow[];
  layout?: "cards" | "rows";
  actions?: (p: PersonDatum) => ReactNode;
  /** Title of the default empty state. */
  emptyText?: string;
  /** Full empty state; wins over `emptyText`. */
  emptyState?: EmptyStateProps;
  /** Renders the style's `LoadingSkeleton` instead of the data. */
  loading?: boolean;
};

export const PEOPLE_EMPTY_TEXT = "Aún no hay personas";

export const DAY_LABELS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  libre: "Libre",
  ocupado: "Ocupado",
  saturado: "Saturado",
  vacaciones: "Vacaciones",
};

const AVAILABILITY_ORDER: Availability[] = ["libre", "ocupado", "saturado", "vacaciones"];

/** Heat thresholds of the "% ocupación" column (Analítico) and of the Visual load bar. */
export const OCCUPANCY_HEAT = { key: "occupancyPct", warnAt: 60, critAt: 90 } as const;

const AVAILABILITY_FILL: Record<Availability, string> = {
  libre: "bg-[color-mix(in_oklab,var(--success)_22%,var(--card))]",
  ocupado: "bg-[color-mix(in_oklab,var(--warning,var(--chart-3))_32%,var(--card))]",
  saturado: "bg-[color-mix(in_oklab,var(--destructive)_32%,var(--card))]",
  vacaciones:
    "border border-border bg-[repeating-linear-gradient(45deg,var(--muted)_0_4px,var(--card)_4px_8px)]",
};

const LINK_CLASS =
  "hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// ── Pure helpers (exported for tests) ───────────────────────────────────────

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Load percentage: `occupancyPct` when present, else open tasks relative to the busiest person. */
export function loadPercent(person: PersonDatum, maxOpen: number): number {
  if (typeof person.occupancyPct === "number") return clampPct(person.occupancyPct);
  if (maxOpen <= 0) return 0;
  return clampPct(Math.round((person.open / maxOpen) * 100));
}

/** Load bar tone for a percentage (same thresholds as the Analítico heat). */
export function loadTone(pct: number): "ok" | "warn" | "critical" {
  if (pct >= OCCUPANCY_HEAT.critAt) return "critical";
  if (pct >= OCCUPANCY_HEAT.warnAt) return "warn";
  return "ok";
}

/** Days rendered by the availability views: the longest `availability` list (≤ 7). */
function dayCount(people: PersonDatum[]): number {
  return Math.min(7, people.reduce((max, p) => Math.max(max, p.availability?.length ?? 0), 0));
}

/** The hours column / line is shown only when requested and returned for someone (B4). */
export function showsHours(people: PersonDatum[], show: PeopleShow[]): boolean {
  return show.includes("hours") && people.some((p) => typeof p.weekHours === "number");
}

export function formatHours(hours: number | null | undefined): string {
  return typeof hours === "number" ? hours.toFixed(1) : "—";
}

function formatDays(indexes: number[]): string {
  if (indexes.length === 1) return `el ${DAY_LABELS[indexes[0]]}`;
  // Three or more consecutive days read as a range ("lun–mié").
  const consecutive = indexes.every((d, i) => i === 0 || d === indexes[i - 1] + 1);
  if (consecutive && indexes.length >= 3) {
    return `${DAY_LABELS[indexes[0]]}–${DAY_LABELS[indexes[indexes.length - 1]]}`;
  }
  const names = indexes.map((d) => DAY_LABELS[d]);
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * Availability as a sentence (Esencial): "Libre lun, jue y vie.",
 * "Vacaciones lun–mié; libre el jue.", "Ocupado toda la semana.".
 * "Ocupado" is the default state and is named only when it fills the week.
 */
export function availabilitySentence(days: Availability[] | undefined): string | null {
  const list = (days ?? []).slice(0, 7);
  if (list.length === 0) return null;
  const first = list[0];
  if (list.every((d) => d === first)) return `${AVAILABILITY_LABELS[first]} toda la semana.`;
  const clauses: string[] = [];
  for (const state of ["vacaciones", "libre", "saturado"] as const) {
    const indexes = list.flatMap((d, i) => (d === state ? [i] : []));
    if (indexes.length > 0) clauses.push(`${AVAILABILITY_LABELS[state].toLowerCase()} ${formatDays(indexes)}`);
  }
  const sentence = clauses.join("; ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatAverage(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

/** Analítico main table: columns per `show`, one row per person, averages row. */
export function buildPeopleTable(people: PersonDatum[], show: PeopleShow[]): RecordTableData {
  const withHours = showsHours(people, show);
  const withLoad = show.includes("load") && people.some((p) => typeof p.occupancyPct === "number");
  const withProjects = show.includes("projects");
  const columns: RecordTableData["columns"] = [
    { key: "name", label: "Persona" },
    { key: "puesto", label: "Puesto" },
    { key: "tramo", label: "Tramo" },
    { key: "open", label: "Abiertas", align: "right", mono: true, format: "count" },
    { key: "overdue", label: "Vencidas", align: "right", mono: true, format: "count" },
  ];
  if (withHours) columns.push({ key: "weekHours", label: "Horas semana", align: "right", mono: true, format: "hours" });
  if (withLoad) columns.push({ key: "occupancyPct", label: "% ocupación", align: "right", mono: true, format: "percent" });
  if (withProjects) {
    columns.push({ key: "activeProjects", label: "Proyectos activos", align: "right", mono: true, format: "count" });
  }

  const rows = people.map((p) => ({
    id: p.id,
    name: p.name,
    puesto: p.puesto ?? "—",
    tramo: p.tramo ?? null,
    open: p.open,
    overdue: p.overdue,
    weekHours: p.weekHours ?? null,
    occupancyPct: p.occupancyPct ?? null,
    activeProjects: p.activeProjects ?? 0,
  }));

  const totals: Record<string, string | number> = {
    name: `Promedio · ${people.length} ${people.length === 1 ? "persona" : "personas"}`,
    open: formatAverage(average(people.map((p) => p.open))),
    overdue: formatAverage(average(people.map((p) => p.overdue))),
  };
  if (withHours) {
    totals.weekHours = formatAverage(
      average(people.flatMap((p) => (typeof p.weekHours === "number" ? [p.weekHours] : []))),
    );
  }
  if (withLoad) {
    const avg = average(people.flatMap((p) => (typeof p.occupancyPct === "number" ? [p.occupancyPct] : [])));
    totals.occupancyPct = avg === null ? "—" : `${Math.round(avg)}%`;
  }
  if (withProjects) totals.activeProjects = formatAverage(average(people.map((p) => p.activeProjects ?? 0)));

  return {
    columns,
    rows,
    totals,
    ...(withLoad ? { heat: [{ key: OCCUPANCY_HEAT.key, warnAt: OCCUPANCY_HEAT.warnAt, critAt: OCCUPANCY_HEAT.critAt }] } : {}),
  };
}

/** Analítico availability table: one column per day plus libres / saturados / vacaciones, team row. */
export function buildAvailabilityTable(people: PersonDatum[]): RecordTableData {
  const days = dayCount(people);
  const columns: RecordTableData["columns"] = [{ key: "name", label: "Persona" }];
  for (let d = 0; d < days; d++) columns.push({ key: `d${d}`, label: DAY_LABELS[d] });
  columns.push(
    { key: "libres", label: "Libres", align: "right", mono: true, format: "count" },
    { key: "saturados", label: "Saturados", align: "right", mono: true, format: "count" },
    { key: "vacaciones", label: "Vacaciones", align: "right", mono: true, format: "count" },
  );
  const count = (list: Availability[] | undefined, state: Availability) =>
    (list ?? []).filter((d) => d === state).length;
  const rows = people.map((p) => {
    const row: Record<string, unknown> = { id: p.id, name: p.name };
    for (let d = 0; d < days; d++) {
      const state = p.availability?.[d];
      row[`d${d}`] = state ? AVAILABILITY_LABELS[state] : "—";
    }
    row.libres = count(p.availability, "libre");
    row.saturados = count(p.availability, "saturado");
    row.vacaciones = count(p.availability, "vacaciones");
    return row;
  });
  const totals: Record<string, string | number> = { name: "Equipo" };
  for (let d = 0; d < days; d++) {
    const free = people.filter((p) => p.availability?.[d] === "libre").length;
    totals[`d${d}`] = `${free} ${free === 1 ? "libre" : "libres"}`;
  }
  totals.libres = people.reduce((n, p) => n + count(p.availability, "libre"), 0);
  totals.saturados = people.reduce((n, p) => n + count(p.availability, "saturado"), 0);
  totals.vacaciones = people.reduce((n, p) => n + count(p.availability, "vacaciones"), 0);
  return { columns, rows, totals };
}

function tramoRef(key: string): WorkflowRef {
  return { id: key, key, name: tramoLabel(key), sortOrder: 0 };
}

function openText(n: number): string {
  return `${n} ${n === 1 ? "tarea abierta" : "tareas abiertas"}`;
}

function overdueText(n: number): string {
  return `${n} ${n === 1 ? "vencida" : "vencidas"}`;
}

function projectsText(n: number): string {
  return `${n} ${n === 1 ? "proyecto" : "proyectos"}`;
}

// ── Widget ──────────────────────────────────────────────────────────────────

export function PeopleWidget({
  people,
  show,
  layout = "cards",
  actions,
  emptyText,
  emptyState,
  loading,
}: PeopleWidgetProps) {
  if (loading) {
    const rows = Math.max(people.length, 3);
    return (
      <StyleView
        visual={() => <LoadingSkeleton variant={layout === "rows" ? "list" : "cards"} rows={rows} />}
        esencial={() => <LoadingSkeleton variant="list" rows={rows} />}
        analitico={() => <LoadingSkeleton variant="table" rows={rows} />}
      />
    );
  }

  if (people.length === 0) {
    return <EmptyState {...(emptyState ?? { title: emptyText ?? PEOPLE_EMPTY_TEXT })} />;
  }

  return (
    <StyleView
      visual={() =>
        layout === "rows" ? (
          <VisualRows people={people} show={show} actions={actions} />
        ) : (
          <VisualCards people={people} show={show} actions={actions} />
        )
      }
      esencial={() => <EsencialList people={people} show={show} actions={actions} layout={layout} />}
      analitico={() => <AnaliticoTables people={people} show={show} actions={actions} />}
    />
  );
}

type ViewProps = { people: PersonDatum[]; show: PeopleShow[]; actions?: (p: PersonDatum) => ReactNode };

// ── Visual ──────────────────────────────────────────────────────────────────

function AvailabilityLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" aria-label="Leyenda">
      {AVAILABILITY_ORDER.map((state) => (
        <li key={state} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-2.5 rounded-[3px]", AVAILABILITY_FILL[state])} />
          {AVAILABILITY_LABELS[state]}
        </li>
      ))}
    </ul>
  );
}

function AvailabilityCell({ state }: { state: Availability | undefined }) {
  if (!state) {
    return (
      <span className="block h-6 rounded-md bg-muted">
        <span className="sr-only">Sin dato</span>
      </span>
    );
  }
  return (
    <span className={cn("block h-6 rounded-md", AVAILABILITY_FILL[state])} title={AVAILABILITY_LABELS[state]}>
      <span className="sr-only">{AVAILABILITY_LABELS[state]}</span>
    </span>
  );
}

function AvailabilityGrid({ people }: { people: PersonDatum[] }) {
  const days = dayCount(people);
  if (days === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Disponibilidad esta semana</h2>
        <AvailabilityLegend />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th scope="col" className="text-left text-xs font-medium text-muted-foreground">
                <span className="sr-only">Persona</span>
              </th>
              {DAY_LABELS.slice(0, days).map((day) => (
                <th key={day} scope="col" className="text-xs font-medium text-muted-foreground">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="pr-3 text-left font-medium whitespace-nowrap">
                  {p.name}
                </th>
                {DAY_LABELS.slice(0, days).map((day, d) => (
                  <td key={day} className="min-w-12">
                    <AvailabilityCell state={p.availability?.[d]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LoadLine({ person, maxOpen }: { person: PersonDatum; maxOpen: number }) {
  const pct = loadPercent(person, maxOpen);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>Carga</span>
        {typeof person.occupancyPct === "number" ? <span className="font-mono">{`${pct}%`}</span> : null}
      </div>
      <LoadBar segments={[{ percent: pct, label: `${pct}%` }]} tone={loadTone(pct)} />
    </div>
  );
}

function CountsLine({ person }: { person: PersonDatum }) {
  return (
    <p className="text-sm">
      <span>{openText(person.open)}</span>
      {person.overdue > 0 ? (
        <>
          {" · "}
          <span className="text-destructive">{overdueText(person.overdue)}</span>
        </>
      ) : null}
    </p>
  );
}

function HoursLine({ hours }: { hours: number | null | undefined }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-mono">{formatHours(hours)}</span> h esta semana
    </p>
  );
}

function VisualCards({ people, show, actions }: ViewProps) {
  const maxOpen = Math.max(0, ...people.map((p) => p.open));
  const withHours = showsHours(people, show);
  const withProjects = show.includes("projects");
  return (
    <div className="flex flex-col gap-4">
      {show.includes("availability") ? <AvailabilityGrid people={people} /> : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {people.map((p) => (
          <li key={p.id}>
            <article
              aria-label={p.name}
              className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
            >
              <PersonAvatar
                name={p.name}
                initials={p.initials}
                imageSrc={p.photoUrl ?? undefined}
                href={p.href}
                subtitle={p.puesto ?? undefined}
                size="lg"
              />
              {p.tramo || withProjects ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  {p.tramo ? <TramoBadge tramo={tramoRef(p.tramo)} variant="chip" /> : <span />}
                  {withProjects ? <span>{projectsText(p.activeProjects ?? 0)}</span> : null}
                </div>
              ) : null}
              <CountsLine person={p} />
              {show.includes("load") ? <LoadLine person={p} maxOpen={maxOpen} /> : null}
              {withHours ? <HoursLine hours={p.weekHours} /> : null}
              {actions ? <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">{actions(p)}</div> : null}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VisualRows({ people, show, actions }: ViewProps) {
  const maxOpen = Math.max(0, ...people.map((p) => p.open));
  const withHours = showsHours(people, show);
  const days = dayCount(people);
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card text-card-foreground shadow-sm">
      {people.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <PersonAvatar
            name={p.name}
            initials={p.initials}
            imageSrc={p.photoUrl ?? undefined}
            href={p.href}
            subtitle={p.puesto ?? undefined}
            size="lg"
            className="min-w-48 flex-1"
          />
          {p.tramo ? <TramoBadge tramo={tramoRef(p.tramo)} variant="chip" /> : null}
          {show.includes("projects") ? (
            <span className="text-sm text-muted-foreground">{projectsText(p.activeProjects ?? 0)}</span>
          ) : null}
          <CountsLine person={p} />
          {show.includes("load") ? (
            <div className="w-36">
              <LoadLine person={p} maxOpen={maxOpen} />
            </div>
          ) : null}
          {withHours ? <HoursLine hours={p.weekHours} /> : null}
          {show.includes("availability") && days > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Disponibilidad</span>
              <ol className="flex gap-1">
                {DAY_LABELS.slice(0, days).map((day, d) => (
                  <li key={day} className="flex w-10 flex-col items-center gap-0.5 text-[11px] text-muted-foreground">
                    <span>{day}</span>
                    <span className="w-full">
                      <AvailabilityCell state={p.availability?.[d]} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions(p)}</div> : null}
        </li>
      ))}
    </ul>
  );
}

// ── Esencial ────────────────────────────────────────────────────────────────

function EsencialList({ people, show, actions, layout }: ViewProps & { layout: "cards" | "rows" }) {
  const withHours = showsHours(people, show);
  const withAvailability = show.includes("availability") && dayCount(people) > 0;
  // Rows layout puts the sentence in each row; cards layout gives it its own list.
  const inlineAvailability = withAvailability && layout === "rows";
  return (
    <div className="flex max-w-[980px] flex-col gap-5 text-[15px]">
      <section className="flex flex-col rounded-xl border bg-card px-6 py-3 text-card-foreground">
        <ul className="flex flex-col">
          {people.map((p, i) => {
            const meta = [
              p.puesto ?? null,
              p.tramo ? tramoLabel(p.tramo) : null,
              show.includes("projects") ? projectsText(p.activeProjects ?? 0) : null,
            ].filter((part): part is string => Boolean(part));
            const sentence = inlineAvailability ? availabilitySentence(p.availability) : null;
            return (
              <li
                key={p.id}
                className={cn("flex flex-wrap items-center justify-between gap-4 py-3", i > 0 && "border-t")}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  {p.href ? (
                    <a href={p.href} className={LINK_CLASS}>
                      {p.name}
                    </a>
                  ) : (
                    <span>{p.name}</span>
                  )}
                  {meta.length > 0 ? (
                    <span className="text-[13px] text-muted-foreground">{meta.join(" · ")}</span>
                  ) : null}
                  {sentence ? <span className="text-[13px] text-muted-foreground">{sentence}</span> : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>
                    {openText(p.open)}
                    {p.overdue > 0 ? (
                      <>
                        {" · "}
                        <span className="text-destructive">{overdueText(p.overdue)}</span>
                      </>
                    ) : null}
                    {show.includes("load") && typeof p.occupancyPct === "number"
                      ? ` · ${p.occupancyPct}% de ocupación`
                      : null}
                    {withHours ? ` · ${formatHours(p.weekHours)} h esta semana` : null}
                  </span>
                  {actions ? <span className="flex flex-wrap items-center gap-2">{actions(p)}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {withAvailability && !inlineAvailability ? (
        <section className="flex flex-col gap-1 rounded-xl border bg-card px-6 py-5 text-card-foreground">
          <h2 className="text-base font-semibold">Disponibilidad esta semana</h2>
          <ul className="flex flex-col">
            {people.map((p) => (
              <li key={p.id} className="flex flex-col gap-0.5 border-t py-3">
                <span>{p.name}</span>
                <span className="text-[13px] text-muted-foreground">
                  {availabilitySentence(p.availability) ?? "Sin datos de disponibilidad."}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ── Analítico ───────────────────────────────────────────────────────────────

function AnaliticoTables({ people, show, actions }: ViewProps) {
  const table = buildPeopleTable(people, show);
  if (actions) table.columns.push({ key: "actions", label: "Acciones" });
  const byId = new Map(people.map((p) => [p.id, p]));
  const withAvailability = show.includes("availability") && dayCount(people) > 0;

  const renderCell = (columnKey: string, row: Record<string, unknown>): ReactNode | undefined => {
    const person = byId.get(String(row.id));
    if (!person) return undefined;
    switch (columnKey) {
      case "name":
        return person.href ? (
          <a href={person.href} className={LINK_CLASS}>
            {person.name}
          </a>
        ) : (
          person.name
        );
      case "tramo":
        return person.tramo ? <TramoBadge tramo={tramoRef(person.tramo)} variant="dot" /> : "—";
      case "overdue":
        return <span className={person.overdue > 0 ? "text-destructive" : undefined}>{person.overdue}</span>;
      case "weekHours":
        return formatHours(person.weekHours);
      case "occupancyPct":
        return typeof person.occupancyPct === "number" ? `${person.occupancyPct}%` : "—";
      case "actions":
        return actions?.(person) ?? null;
      default:
        return undefined;
    }
  };

  return (
    <div className="flex flex-col gap-4 text-[12.5px]">
      <RecordTable data={table} renderCell={renderCell} density="compacta" />
      {withAvailability ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Disponibilidad</h2>
          <RecordTable data={buildAvailabilityTable(people)} density="compacta" />
        </section>
      ) : null}
    </div>
  );
}
