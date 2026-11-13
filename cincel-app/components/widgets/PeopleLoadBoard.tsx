"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { EtapaBadge } from "@/components/widgets/EtapaBadge";
import { assignTaskAction } from "@/lib/actions/tasks-actions";
import { areaTintClass } from "@/lib/areas/area-color";
import { addIsoDays, fourWeeks, localIsoDate } from "@/lib/people/aggregates";
import {
  LOAD_BUCKET_LABEL,
  loadBucket,
  personStatus,
  saturationSummary,
  type LoadBucket,
  type PersonStatus,
} from "@/lib/personas/team";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { personasDetailOptions } from "@/lib/query/options/personas";
import { taskAssignInvalidations } from "@/lib/query/options/tareas";
import { etapaColorSlot, etapaColorVar, etapaLabel } from "@/lib/etapas/compat";
import { TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/local-time";
import type { TaskDetail, WorkflowRef } from "@/lib/types/core";
import type { WeekLoad } from "@/lib/types/redesign";
import type { AttentionItem, PersonDatum } from "@/lib/types/widgets";
import { staggerStyle } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

/**
 * Personas · Equipo in Visual (Estilos Phase 5, frame `Personas-Visual`):
 * the "Quién está saturado" banner with a one-click reassign, three summary
 * cards (team load, people per etapa, upcoming vacations), the team board
 * (load ring per person) and the 4-week load heatmap. Every number comes from
 * `personas.equipo()`; load is open tasks ÷ weekly capacity (no hours), with
 * the one threshold set of `loadBucket`. Mounted by `EquipoView` in the
 * Visual branch of `PageStyleLayout`.
 */
export type PeopleLoadBoardProps = {
  people: PersonDatum[];
  /** Active etapas in order (`personas.equipo().etapas`); without them, the etapas the people have. */
  etapas?: WorkflowRef[];
  /** `activities.canChangeResponsible`: the banner's reassign button. */
  canAssign: boolean;
  /** Per-person actions under each board card (Ver tareas, Correo, Cutto). */
  actions?: (person: PersonDatum) => ReactNode;
  /** ISO date in the org time zone; defaults to today. */
  today?: string;
  /** Renders the skeleton of the layout instead of the data. */
  loading?: boolean;
};

// ── Pure helpers (exported for tests) ───────────────────────────────────────

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dayMonth(iso: string): { day: number; month: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  return { day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()]! };
}

/** "9 nov". */
export function shortDate(iso: string): string {
  const { day, month } = dayMonth(iso);
  return `${day} ${month}`;
}

/** "9–13 nov" in one month, "30 nov–4 dic" across two. */
export function dateRange(from: string, to: string): string {
  const a = dayMonth(from);
  const b = dayMonth(to);
  if (from.slice(0, 7) === to.slice(0, 7)) return a.day === b.day ? shortDate(from) : `${a.day}–${b.day} ${b.month}`;
  return `${shortDate(from)}–${shortDate(to)}`;
}

/** Heatmap column header of the week that starts on `monday`: "9–15 nov", "30 nov–6 dic". */
export function weekLabel(monday: string): string {
  return dateRange(monday, addIsoDays(monday, 6));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a", "a y b", "a, b y c", "a, b, c y 2 más". */
export function namesList(names: string[], max = 3): string {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  const parts = rest > 0 ? [...shown, `${rest} más`] : shown;
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/** Weekly capacity in tasks, back from `open` and the rounded `occupancyPct`. */
function capacityOf(person: PersonDatum): number {
  const pct = person.occupancyPct ?? 0;
  return pct > 0 ? Math.round((person.open * 100) / pct) : 0;
}

/** The banner's second line: overdue tasks (etapa and projects) or, without any, open vs capacity. */
export function saturationLine(person: PersonDatum): string {
  if (person.overdue <= 0) {
    return `${plural(person.open, "tarea abierta", "tareas abiertas")} para una capacidad de ${capacityOf(person)}.`;
  }
  const etapa = person.etapa ? ` en ${etapaLabel(person.etapa)}` : "";
  const projects = (person.projects ?? []).filter((p) => p.overdue > 0).map((p) => p.name);
  const list = projects.length > 0 ? ` · ${namesList(projects)}` : "";
  return `${plural(person.overdue, "tarea vencida", "tareas vencidas")}${etapa}${list}.`;
}

/**
 * The task the banner moves: the open, not overdue task with the latest due
 * date whose etapa equals the candidate's. Undated tasks are left out.
 */
export function taskToMove(tasks: AttentionItem[], etapa: string | null | undefined, today: string): AttentionItem | null {
  if (!etapa) return null;
  const eligible = tasks.filter((t) => t.due !== null && t.due >= today && t.etapa === etapa);
  eligible.sort((a, b) => (a.due! < b.due! ? 1 : a.due! > b.due! ? -1 : a.title.localeCompare(b.title, "es")));
  return eligible[0] ?? null;
}

/** Absent all of this week (Mon–Fri): out of the "Carga del equipo" bar. */
export function absentAllWeek(person: PersonDatum): boolean {
  const week = person.weeks?.[0];
  if (week) return week.absentDays >= 5;
  const days = person.availability ?? [];
  return days.length >= 5 && days.every((d) => d === "vacaciones");
}

export const LOAD_BUCKETS: LoadBucket[] = ["libre", "ocupado", "cargado", "saturado"];

/** People per load bucket, without those absent all week. */
export function teamLoad(people: PersonDatum[]): { counts: Record<LoadBucket, number>; total: number; away: number } {
  const counts: Record<LoadBucket, number> = { libre: 0, ocupado: 0, cargado: 0, saturado: 0 };
  let away = 0;
  for (const p of people) {
    if (absentAllWeek(p)) away += 1;
    else counts[loadBucket(p.occupancyPct ?? 0)] += 1;
  }
  return { counts, total: people.length - away, away };
}

/** "Personas por etapa": one row per active etapa, in order, and "Sin etapa" only when someone has none. */
export function etapaRows(
  people: PersonDatum[],
  etapas: WorkflowRef[] | undefined,
): { key: string | null; label: string; count: number; color: string }[] {
  const known: { key: string; name: string; sortOrder?: number }[] =
    etapas && etapas.length > 0
      ? etapas
      : [...new Set(people.flatMap((p) => (p.etapa ? [p.etapa] : [])))]
          .map((key) => ({ key, name: etapaLabel(key) }))
          .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const rows: { key: string | null; label: string; count: number; color: string }[] = known.map((t) => ({
    key: t.key,
    label: etapaColorSlot(t.key) ? etapaLabel(t.key) : t.name,
    count: people.filter((p) => p.etapa === t.key).length,
    color: etapaColorVar(t.key, t.sortOrder),
  }));
  const keys = new Set(known.map((t) => t.key));
  const none = people.filter((p) => !p.etapa || !keys.has(p.etapa)).length;
  if (none > 0) rows.push({ key: null, label: "Sin etapa", count: none, color: "var(--muted-foreground)" });
  return rows;
}

export type UpcomingAbsence = { person: PersonDatum; from: string; to: string; text: string };

/**
 * "Vacaciones próximas": each person's first absence that ends today or
 * later, by start date. Absent today → "hasta 13 nov"; later → "12–16 nov".
 */
export function upcomingAbsences(people: PersonDatum[], today: string): UpcomingAbsence[] {
  const out: UpcomingAbsence[] = [];
  for (const person of people) {
    const next = [...(person.absences ?? [])]
      .filter((a) => a.to >= today)
      .sort((a, b) => a.from.localeCompare(b.from))[0];
    if (!next) continue;
    const text = next.from <= today ? `hasta ${shortDate(next.to)}` : dateRange(next.from, next.to);
    out.push({ person, from: next.from, to: next.to, text });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.person.name.localeCompare(b.person.name, "es"));
}

/** The text after the pct on a board card: bucket label, "sale 12 nov" or "vuelve 16 nov". */
export function statusText(status: PersonStatus): string {
  if (status.kind === "ausente") return `vuelve ${shortDate(addIsoDays(status.until, 1))}`;
  if (status.kind === "sale") return `sale ${shortDate(status.from)}`;
  return LOAD_BUCKET_LABEL[status.bucket].toLowerCase();
}

// ── Styling by bucket (tokens only) ─────────────────────────────────────────

const BUCKET_FILL: Record<LoadBucket, string> = {
  libre: "bg-chart-1",
  ocupado: "bg-secondary",
  cargado: "bg-chart-3",
  saturado: "bg-destructive",
};

const RING_STROKE: Record<LoadBucket, string> = {
  libre: "stroke-primary",
  ocupado: "stroke-primary",
  cargado: "stroke-chart-3",
  saturado: "stroke-destructive",
};

const PCT_TEXT: Record<LoadBucket, string> = {
  libre: "text-secondary-foreground",
  ocupado: "text-secondary-foreground",
  cargado: "text-[color:var(--chart-3-ink,var(--foreground))]",
  saturado: "text-destructive",
};

const HEAT_CELL: Record<LoadBucket, string> = {
  libre: "bg-secondary text-secondary-foreground",
  ocupado: "bg-chart-3/14 dark:bg-chart-3/22 text-[color:var(--chart-3-ink,var(--foreground))]",
  cargado: "bg-chart-3/14 dark:bg-chart-3/22 text-[color:var(--chart-3-ink,var(--foreground))]",
  saturado: "bg-destructive/14 dark:bg-destructive/22 text-destructive",
};

const VACATION_STRIPES =
  "bg-[repeating-linear-gradient(45deg,color-mix(in_oklab,var(--chart-4)_24%,var(--card))_0_4px,color-mix(in_oklab,var(--chart-4)_10%,var(--card))_4px_8px)] text-[color:var(--chart-4-ink,var(--foreground))]";

const LINK_CLASS =
  "hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// ── Widget ──────────────────────────────────────────────────────────────────

export function PeopleLoadBoard({ people, etapas, canAssign, actions, today, loading = false }: PeopleLoadBoardProps) {
  if (loading) return <PeopleLoadBoardSkeleton />;
  const day = today ?? localIsoDate(new Date(), TIME_TRACKING_TIME_ZONE);
  const summary = saturationSummary(people, day);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {summary ? (
        <SaturationBanner
          key={summary.top.id}
          top={summary.top}
          nearLimit={summary.nearLimit}
          candidate={summary.candidate}
          canAssign={canAssign}
          today={day}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TeamLoadCard people={people} />
        <EtapaCard people={people} etapas={etapas} />
        <VacationsCard people={people} today={day} />
      </div>
      <section aria-label="Equipo" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {people.map((person, index) => (
          <BoardCard key={person.id} person={person} index={index} today={day} actions={actions} />
        ))}
      </section>
      <LoadHeatmap people={people} today={day} />
    </div>
  );
}

function PeopleLoadBoardSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="h-[104px] rounded-lg" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[248px] rounded-lg" />
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-6">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    </div>
  );
}

// ── Banner ──────────────────────────────────────────────────────────────────

type MoveVars = { taskId: string; to: string };

function SaturationBanner({
  top,
  nearLimit,
  candidate,
  canAssign,
  today,
}: {
  top: PersonDatum;
  nearLimit: PersonDatum[];
  candidate: PersonDatum | null;
  canAssign: boolean;
  today: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const wantsButton = canAssign && candidate !== null;
  // Prefetched as soon as the banner renders; a failure only hides the button.
  const detail = useQuery({ ...personasDetailOptions(top.id), enabled: wantsButton });
  const task = wantsButton ? taskToMove(detail.data?.tasks ?? [], candidate!.etapa, today) : null;

  // Move and undo refresh the same keys: the team, both people's detail and the task views.
  const move = useActionMutation<MoveVars, TaskDetail>(({ taskId, to }) => assignTaskAction(taskId, to), {
    invalidate: [
      qk.personas.equipo(),
      qk.personas.detail(top.id),
      ...(candidate ? [qk.personas.detail(candidate.id)] : []),
      ...taskAssignInvalidations(),
    ],
  });

  // After a move the button keeps focus; when it is gone, focus moves to the banner heading.
  useEffect(() => {
    if (!refocus.current || move.isPending) return;
    refocus.current = false;
    if (!buttonRef.current) headingRef.current?.focus();
  });

  const pct = top.occupancyPct ?? 0;

  function handleMove() {
    if (!task || !candidate || move.isPending) return;
    const vars = { taskId: task.id, to: candidate.id };
    const target = candidate;
    move.mutate(vars, {
      onSuccess: () => {
        refocus.current = true;
        toast(`Tarea movida a ${target.name}`, {
          action: { label: "Deshacer", onClick: () => move.mutate({ taskId: vars.taskId, to: top.id }) },
        });
      },
    });
  }

  return (
    <section
      aria-label="Quién está saturado"
      className="flex flex-wrap items-center gap-5 rounded-lg bg-destructive/14 px-6 py-5 dark:bg-destructive/22"
    >
      <span
        aria-hidden="true"
        className="flex size-16 shrink-0 items-center justify-center rounded-full border-[3px] border-destructive bg-card text-xl font-semibold text-destructive"
      >
        {top.initials}
      </span>
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
        <span className="font-mono text-[11px] tracking-[0.1em] text-destructive uppercase">Quién está saturado</span>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          {`${top.name} va al ${pct} % esta semana`}
        </h2>
        <p className="text-[13.5px] break-words text-foreground">{saturationLine(top)}</p>
      </div>
      {nearLimit.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-foreground">Cerca del límite:</span>
          <ul className="flex flex-wrap gap-2">
            {nearLimit.map((p) => (
              <li key={p.id}>
                <Badge variant="secondary" className="h-auto rounded-full px-2.5 py-1 text-[12.5px] font-medium">
                  <span>{p.name}</span>
                  <span className="font-mono text-[color:var(--chart-3-ink,var(--foreground))]">{`${p.occupancyPct ?? 0} %`}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {task && candidate ? (
        <Button
          ref={buttonRef}
          type="button"
          className="h-[38px] w-full sm:w-auto"
          // Stays focusable while pending (aria-disabled, not disabled) so focus stays on it.
          aria-busy={move.isPending || undefined}
          aria-disabled={move.isPending || undefined}
          onClick={handleMove}
        >
          {move.isPending ? <LoaderCircle aria-hidden="true" className="spin" /> : null}
          {`Mover 1 tarea a ${candidate.name} (${candidate.occupancyPct ?? 0} %)`}
        </Button>
      ) : null}
    </section>
  );
}

// ── Summary cards ───────────────────────────────────────────────────────────

function SummaryCard({ title, index, children }: { title: string; index: number; children: ReactNode }) {
  return (
    <Card className="anim-in gap-3 rounded-lg px-5 py-[18px]" style={staggerStyle(index, 60, 2)}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function TeamLoadCard({ people }: { people: PersonDatum[] }) {
  const { counts, total, away } = teamLoad(people);
  const visible = LOAD_BUCKETS.filter((b) => counts[b] > 0);
  return (
    <SummaryCard title="Carga del equipo" index={0}>
      <div aria-hidden="true" className="flex h-3.5 overflow-hidden rounded-full bg-muted">
        {visible.map((bucket, i) => (
          <span
            key={bucket}
            className={cn("grow-x h-full", BUCKET_FILL[bucket])}
            style={{ ...staggerStyle(i, 80, 3), width: `${(counts[bucket] / total) * 100}%` }}
          />
        ))}
      </div>
      <ul aria-label="Personas por carga" className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-foreground">
        {LOAD_BUCKETS.map((bucket) => (
          <li key={bucket} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-2 rounded-full", BUCKET_FILL[bucket])} />
            {`${LOAD_BUCKET_LABEL[bucket]} ${counts[bucket]}`}
          </li>
        ))}
        {away > 0 ? <li>{`+ ${away} de vacaciones`}</li> : null}
      </ul>
    </SummaryCard>
  );
}

function EtapaCard({ people, etapas }: { people: PersonDatum[]; etapas?: WorkflowRef[] }) {
  const rows = etapaRows(people, etapas);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <SummaryCard title="Personas por etapa" index={1}>
      <ul className="flex flex-col gap-2 text-[12.5px]">
        {rows.map((row, i) => (
          <li key={row.key ?? "sin-etapa"} className="flex items-center gap-2.5">
            <span className="w-[92px] shrink-0 truncate" title={row.label}>
              {row.label}
            </span>
            <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="grow-x block h-full rounded-full"
                style={{ ...staggerStyle(i, 80, 6), width: `${(row.count / max) * 100}%`, background: row.color }}
              />
            </span>
            <span className="w-4 shrink-0 text-right font-mono">{row.count}</span>
          </li>
        ))}
      </ul>
    </SummaryCard>
  );
}

function VacationsCard({ people, today }: { people: PersonDatum[]; today: string }) {
  const rows = upcomingAbsences(people, today);
  const shown = rows.slice(0, 4);
  const rest = rows.length - shown.length;
  return (
    <SummaryCard title="Vacaciones próximas" index={2}>
      {rows.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">Nadie sale en las próximas 4 semanas.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map(({ person, text }) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-md bg-chart-4/14 px-3 py-2.5 dark:bg-chart-4/22"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-[13px] font-semibold text-[color:var(--chart-4-ink,var(--foreground))]"
              >
                {person.initials}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium" title={person.name}>
                {person.name}
              </span>
              <span className="shrink-0 font-mono text-[12.5px] text-[color:var(--chart-4-ink,var(--foreground))]">
                {text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rest > 0 ? (
        <Link href="/personas?estilo=analitico" className={cn("text-[12.5px] text-muted-foreground", LINK_CLASS)}>
          {`Ver ${rest} más`}
        </Link>
      ) : null}
    </SummaryCard>
  );
}

// ── Board ───────────────────────────────────────────────────────────────────

function LoadRing({ pct, bucket }: { pct: number; bucket: LoadBucket }) {
  const offset = 100 - Math.max(0, Math.min(100, pct));
  return (
    <svg aria-hidden="true" viewBox="0 0 72 72" className="absolute inset-0 size-24 -rotate-90">
      <circle cx="36" cy="36" r="30" fill="none" strokeWidth="5" className="stroke-muted" />
      <circle
        cx="36"
        cy="36"
        r="30"
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        pathLength={100}
        className={cn("ring", RING_STROKE[bucket])}
        style={{ "--ring-offset": offset } as CSSProperties}
      />
    </svg>
  );
}

function countsLine(person: PersonDatum): ReactNode {
  const open = plural(person.open, "abierta", "abiertas");
  if (person.overdue === 0) return `${open} · sin vencidas`;
  return (
    <>
      {`${open} · `}
      <span className="text-destructive">{plural(person.overdue, "vencida", "vencidas")}</span>
    </>
  );
}

function BoardCard({
  person,
  index,
  today,
  actions,
}: {
  person: PersonDatum;
  index: number;
  today: string;
  actions?: (person: PersonDatum) => ReactNode;
}) {
  const pct = person.occupancyPct ?? 0;
  const bucket = loadBucket(pct);
  const status = personStatus(person, today);
  const ribbon = status.kind === "ausente" || status.kind === "sale";
  const etapaSlot = person.etapa ? etapaColorSlot(person.etapa) : null;
  return (
    <Card
      className="anim-in lift relative items-center gap-2.5 rounded-lg px-[18px] pt-[22px] pb-[18px] text-center"
      style={staggerStyle(index, 50, 8)}
    >
      {ribbon ? (
        <span
          aria-hidden="true"
          className="absolute top-3 -right-8 w-28 rotate-[35deg] bg-chart-4 py-0.5 text-[11px] font-semibold text-primary-foreground"
        >
          Vacaciones
        </span>
      ) : null}
      <div className="relative size-24 shrink-0">
        <LoadRing pct={pct} bucket={bucket} />
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-[14px] flex items-center justify-center rounded-full text-[22px] font-semibold",
            areaTintClass(etapaSlot),
          )}
        >
          {person.initials}
        </span>
      </div>
      <span className={cn("font-mono text-[13px] font-medium", PCT_TEXT[bucket])}>
        {`${pct} % · ${statusText(status)}`}
      </span>
      <span className="w-full min-w-0 truncate text-base font-semibold" title={person.name}>
        {person.href ? (
          <Link href={person.href} className={LINK_CLASS}>
            {person.name}
          </Link>
        ) : (
          person.name
        )}
      </span>
      {person.puesto ? (
        <span className="w-full min-w-0 truncate text-[12.5px] text-muted-foreground" title={person.puesto}>
          {person.puesto}
        </span>
      ) : null}
      {person.etapa ? (
        <EtapaBadge etapa={{ id: person.etapa, key: person.etapa, name: etapaLabel(person.etapa), sortOrder: 0 }} />
      ) : null}
      <span className="text-[12.5px] text-foreground">{countsLine(person)}</span>
      {actions ? <div className="mt-auto flex flex-wrap justify-center pt-1">{actions(person)}</div> : null}
    </Card>
  );
}

// ── Heatmap ─────────────────────────────────────────────────────────────────

function HeatCell({ week }: { week: WeekLoad | undefined }) {
  if (!week) {
    return <span className="block rounded-sm bg-muted p-2.5 font-mono text-muted-foreground">—</span>;
  }
  if (week.absentDays >= 5) {
    return <span className={cn("block rounded-sm p-2.5 font-mono", VACATION_STRIPES)}>Vac.</span>;
  }
  return (
    <span className={cn("block rounded-sm p-2.5 font-mono", HEAT_CELL[loadBucket(week.occupancyPct)])}>
      {`${week.occupancyPct} %`}
      {week.absentDays > 0 ? (
        <span className="sr-only">{`, ${plural(week.absentDays, "día", "días")} de vacaciones`}</span>
      ) : null}
    </span>
  );
}

const HEAT_LEGEND: { label: string; className: string }[] = [
  { label: "Menos de 60 %", className: HEAT_CELL.libre },
  { label: "60–100 %", className: HEAT_CELL.cargado },
  { label: "Más de 100 %", className: HEAT_CELL.saturado },
  { label: "Vacaciones", className: VACATION_STRIPES },
];

function LoadHeatmap({ people, today }: { people: PersonDatum[]; today: string }) {
  const headingId = useId();
  // The loader's Mondays; without any row carrying `weeks`, the same 4 Mondays (cells read "—").
  const mondays = people.find((p) => p.weeks && p.weeks.length > 0)?.weeks?.map((w) => w.weekStart) ?? [];
  const weeks = mondays.length > 0 ? mondays : fourWeeks(today);
  return (
    <section aria-labelledby={headingId}>
      <Card className="gap-3.5 rounded-lg px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={headingId} className="text-[15px] font-semibold">
            Carga de las próximas 4 semanas
          </h2>
          <ul aria-label="Leyenda" className="flex flex-wrap items-center gap-3 text-[12.5px] text-foreground">
            {HEAT_LEGEND.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={cn("h-2.5 w-3.5 rounded-sm", item.className)} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-1 text-[12.5px]">
            <caption className="sr-only">Carga por persona y semana</caption>
            <thead>
              <tr>
                <th scope="col" className="w-28 text-left font-normal lg:w-[180px]">
                  <span className="sr-only">Persona</span>
                </th>
                {weeks.map((monday) => (
                  <th
                    key={monday}
                    scope="col"
                    className="font-mono text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
                  >
                    {weekLabel(monday)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <th
                    scope="row"
                    className="max-w-28 truncate pr-3 text-left font-medium lg:max-w-[180px]"
                    title={person.name}
                  >
                    {person.name}
                  </th>
                  {weeks.map((monday, i) => (
                    <td key={monday} className="text-center">
                      <HeatCell week={person.weeks?.[i]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

