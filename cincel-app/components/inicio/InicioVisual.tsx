"use client";

import { CircleAlert, Clock, FolderOpen, ListTodo, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, type CSSProperties } from "react";

import { buttonVariants } from "@/components/ui/shadcn/button";
import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { kpiValueText } from "@/components/widgets/KpiWidget";
import { LineSeriesWidget, type LineSeries } from "@/components/widgets/LineSeriesWidget";
import { PageHeader } from "@/components/widgets/PageHeader";
import { LIFT_CLASS } from "@/components/widgets/lift";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { areaTintClass } from "@/lib/areas/area-color";
import { greetingFor } from "@/lib/inicio/header";
import {
  AGENDA_CAP,
  ATTENTION_CAP,
  HERO_AVATAR_CAP,
  PROJECT_AVATAR_CAP,
  PROJECTS_CAP,
  agendaTime,
  attentionBlocked,
  attentionCaption,
  attentionMeta,
  capAvatars,
  dueTodayCaption,
  heroDateLabel,
  heroSentence,
  lateChip,
  openShiftsCaption,
  projectChip,
  projectMeta,
  sortProjects,
  tileAriaLabel,
  tileDelta,
  visualHeaderDescription,
  type DeltaTone,
} from "@/lib/inicio/visual";
import { sliceToRange } from "@/lib/stores/dashboard-store";
import { useInicioDashboard } from "@/lib/stores/inicio-dashboard-store";
import { tramoColorSlot, tramoColorVar, tramoLabel } from "@/lib/tramos/compat";
import { staggerStyle } from "@/lib/ui/motion";
import type { InicioData } from "@/lib/types/redesign";
import type { AgendaItem, AttentionItem, KpiDatum, ProgressItem, TramoKey } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

import { EmptyWidgetCard } from "./EmptyWidgetCard";
import { weekLabel, weeklyPaceTable } from "./WeeklyPaceChart";

export type InicioVisualProps = {
  data: InicioData;
  me: { firstName: string };
  /** The instant the page was rendered at (greeting and dates). */
  renderedAt: Date;
};

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** A token color mixed into the card surface (tint backgrounds of icon boxes and agenda dots). */
function tintOf(colorVar: string, pct = 14): string {
  return `color-mix(in oklab, ${colorVar} ${pct}%, var(--card))`;
}

function tramoTint(tramo: TramoKey | null | undefined): string {
  return areaTintClass(tramo ? tramoColorSlot(tramo) : null);
}

function tramoColor(tramo: TramoKey | null | undefined): string {
  return tramo ? tramoColorVar(tramo) : "var(--muted-foreground)";
}

// ── Avatars ──────────────────────────────────────────────────────────────────

type AvatarPerson = { id: string; initials: string; tramo: TramoKey | null };

/** Overlapping initials avatars (decorative: the caption or card text carries the meaning). */
function AvatarStack({ people, cap, size }: { people: AvatarPerson[]; cap: number; size: "hero" | "card" }) {
  const { shown, extra } = capAvatars(people, cap);
  if (shown.length === 0) return null;
  const box =
    size === "hero"
      ? "size-[34px] border-2 border-primary text-xs font-semibold"
      : "size-[22px] border-2 border-card text-[9px] font-semibold";
  return (
    <span aria-hidden="true" data-slot="avatar-stack" className="flex -space-x-2">
      {shown.map((p) => (
        <span
          key={p.id}
          data-slot="avatar"
          className={cn("flex shrink-0 items-center justify-center rounded-full", box, tramoTint(p.tramo))}
        >
          {p.initials}
        </span>
      ))}
      {extra > 0 ? (
        <span
          data-slot="avatar-extra"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-card text-card-foreground",
            box,
            size === "hero" && "text-[11px]",
          )}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ data, greeting, renderedAt }: { data: InicioData; greeting: string; renderedAt: Date }) {
  const { hero, openShifts } = data;
  return (
    <section
      aria-label="Saludo"
      data-slot="inicio-hero"
      className="anim-in flex flex-wrap items-center gap-6 rounded-[14px] bg-primary px-5 py-6 text-primary-foreground sm:px-8 sm:py-7"
    >
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
        <p className="font-mono text-xs tracking-[0.12em] text-secondary uppercase">{heroDateLabel(renderedAt)}</p>
        <h2 className="text-[28px] leading-tight font-semibold">{greeting}</h2>
        <p data-slot="hero-sentence" className="text-[15px] text-secondary">
          {heroSentence(hero)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/tareas?mostrar=en_retraso"
            className={cn(
              "inline-flex h-[34px] items-center rounded-[10px] bg-card px-3.5 text-[13px] font-semibold text-secondary-foreground",
              FOCUS_RING,
            )}
          >
            Ver vencidas
          </Link>
          {hero.focusProject ? (
            <Link
              href={hero.focusProject.href}
              className={cn(
                "inline-flex h-[34px] max-w-full items-center truncate rounded-[10px] bg-primary-foreground/14 px-3.5 text-[13px] font-medium",
                FOCUS_RING,
              )}
            >
              Abrir {hero.focusProject.name}
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <p className="flex flex-col">
          <span data-slot="hero-due-today" className="text-[40px] leading-none font-semibold tabular-nums">
            {hero.dueToday}
          </span>
          <span className="text-[12.5px]">{dueTodayCaption(hero.dueToday)}</span>
        </p>
        {openShifts ? (
          <>
            <span aria-hidden="true" className="h-14 w-px bg-primary-foreground/25" />
            <div className="flex flex-col gap-2">
              <AvatarStack people={openShifts.people} cap={HERO_AVATAR_CAP} size="hero" />
              <p className="text-[12.5px]">{openShiftsCaption(openShifts.count)}</p>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

// ── KPI tiles ────────────────────────────────────────────────────────────────

type TileSpec = { key: string; icon: LucideIcon; colorVar: string; valueClass?: string };

const TILES: TileSpec[] = [
  { key: "abiertas", icon: ListTodo, colorVar: "var(--chart-1)" },
  { key: "vencidas", icon: CircleAlert, colorVar: "var(--destructive)", valueClass: "text-destructive" },
  { key: "proyectos_activos", icon: FolderOpen, colorVar: "var(--chart-2)" },
  { key: "horas_semana", icon: Clock, colorVar: "var(--chart-4)" },
];

const DELTA_CLASS: Record<DeltaTone, string> = {
  bad: "bg-tint-destructive text-destructive-ink",
  good: "bg-tint-success text-success",
  neutral: "bg-muted text-muted-foreground",
};

const SPARK_W = 120;
const SPARK_H = 32;

/** Polyline points of a 7-day series in a `SPARK_W × SPARK_H` box (2 px stroke margin). */
export function sparkPoints(values: number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? SPARK_W / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = values.length > 1 ? i * step : SPARK_W / 2;
      const y = SPARK_H - 2 - ((v - min) / span) * (SPARK_H - 4);
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(" ");
}

function KpiTile({ kpi, spec, index }: { kpi: KpiDatum; spec: TileSpec; index: number }) {
  const Icon = spec.icon;
  const value = kpiValueText(kpi);
  const delta = tileDelta(kpi);
  const series = kpi.series7 ?? [];
  return (
    <div
      role="group"
      aria-label={tileAriaLabel(kpi, value)}
      data-slot="inicio-tile"
      data-kpi={kpi.key}
      className="anim-in flex flex-col gap-2.5 rounded-[14px] border bg-card px-5 py-[18px] text-card-foreground"
      style={staggerStyle(index)}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: tintOf(spec.colorVar), color: spec.colorVar }}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 truncate text-[13px] text-foreground">{kpi.label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span
          data-slot="tile-value"
          className={cn("text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums", spec.valueClass)}
        >
          {value}
        </span>
        {delta ? (
          <span
            data-slot="tile-delta"
            data-tone={delta.tone}
            className={cn("rounded-full px-2 py-0.5 font-mono text-xs tabular-nums", DELTA_CLASS[delta.tone])}
          >
            {delta.text}
          </span>
        ) : null}
      </div>
      {series.length > 0 ? (
        <svg
          aria-hidden="true"
          data-slot="tile-sparkline"
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          className="h-8 w-full overflow-visible"
        >
          <polyline
            className="draw"
            pathLength={1}
            points={sparkPoints(series)}
            fill="none"
            stroke={spec.colorVar}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </div>
  );
}

function KpiTiles({ kpis }: { kpis: KpiDatum[] }) {
  const byKey = new Map(kpis.map((k) => [k.key, k]));
  const tiles = TILES.flatMap((spec) => {
    const kpi = byKey.get(spec.key);
    return kpi ? [{ spec, kpi }] : [];
  });
  if (tiles.length === 0) return null;
  return (
    <div data-slot="inicio-tiles" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map(({ spec, kpi }, i) => (
        <KpiTile key={spec.key} kpi={kpi} spec={spec} index={i} />
      ))}
    </div>
  );
}

// ── Charts ───────────────────────────────────────────────────────────────────

const PACE_SERIES: LineSeries[] = [
  { key: "completed", label: "Completadas", colorVar: "var(--chart-1)" },
  { key: "created", label: "Creadas", colorVar: "var(--chart-2)", dashed: true },
];

/** The values of a chart as a table for screen readers. */
function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only" data-slot="chart-sr-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={j}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PaceCard({ weeks }: { weeks: InicioData["weeklyPace"] }) {
  const range = useInicioDashboard((s) => s.range);
  const shown = sliceToRange(weeks, range);
  if (shown.length === 0 || shown.every((w) => w.created === 0 && w.completed === 0)) {
    return <EmptyWidgetCard widget="weeklyPace" title="Ritmo semanal" text="Sin tareas creadas ni completadas." />;
  }
  return (
    <div data-slot="inicio-pace" className="min-w-0">
      <LineSeriesWidget
        title="Ritmo semanal"
        points={shown.map((w) => ({
          key: w.weekStart,
          label: weekLabel(w.weekStart),
          values: { completed: w.completed, created: w.created },
        }))}
        series={PACE_SERIES}
        table={weeklyPaceTable(shown)}
      />
      <SrTable
        caption="Ritmo semanal"
        head={["Semana", "Completadas", "Creadas"]}
        rows={shown.map((w) => [weekLabel(w.weekStart), w.completed, w.created])}
      />
    </div>
  );
}

function TramoCard({ segments }: { segments: InicioData["tasksByTramo"] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (segments.length === 0 || total === 0) {
    return <EmptyWidgetCard widget="tramoDonut" title="Tareas por etapa" text="No hay tareas abiertas." />;
  }
  return (
    <div data-slot="inicio-tramos" className="min-w-0">
      <DistributionWidget title="Tareas por etapa" segments={segments} totalLabel="Abiertas" />
      <SrTable caption="Tareas por etapa" head={["Etapa", "Abiertas"]} rows={segments.map((s) => [s.label, s.value])} />
    </div>
  );
}

// ── Requiere atención ────────────────────────────────────────────────────────

const CHIP = "inline-flex items-center rounded-full px-2 py-0.5 text-xs";

function AttentionCard({ item, index }: { item: AttentionItem; index: number }) {
  const blocked = attentionBlocked(item);
  const late = lateChip(item.daysLate);
  const stripe = blocked ? "var(--destructive)" : tramoColor(item.tramo);
  const pct = Math.max(0, Math.min(100, item.progressPct ?? 0));
  return (
    <li className="min-w-0">
      <Link
        href={item.href}
        data-slot="attention-card"
        className={cn(
          "anim-in flex h-full flex-col overflow-hidden rounded-[14px] border bg-card text-card-foreground",
          LIFT_CLASS,
          FOCUS_RING,
        )}
        style={staggerStyle(index)}
      >
        <span aria-hidden="true" className="h-1.5 w-full shrink-0" style={{ backgroundColor: stripe }} />
        <span className="flex flex-col gap-2 px-[18px] py-4">
          <span className="flex flex-wrap items-center gap-1.5">
            {item.tramo ? <span className={cn(CHIP, "font-medium", tramoTint(item.tramo))}>{tramoLabel(item.tramo)}</span> : null}
            {late && !blocked ? (
              <span
                data-slot="late-chip"
                data-tone={late.tone}
                className={cn(
                  CHIP,
                  "font-mono tabular-nums",
                  late.tone === "destructive"
                    ? "bg-tint-destructive text-destructive-ink"
                    : "bg-tint-warning text-warning-ink",
                )}
              >
                {late.text}
              </span>
            ) : null}
            {blocked ? (
              <span className={cn(CHIP, "bg-tint-destructive font-medium text-destructive-ink")}>Bloqueado</span>
            ) : null}
          </span>
          <span className="line-clamp-2 text-[15px] font-semibold">{item.title}</span>
          <span className="truncate text-[13px] text-muted-foreground">{attentionMeta(item)}</span>
          <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="grow-x block h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: blocked ? "var(--destructive)" : tramoColor(item.tramo) }}
            />
          </span>
          <span data-slot="attention-caption" className="font-mono text-xs text-muted-foreground">
            {attentionCaption(item)}
          </span>
        </span>
      </Link>
    </li>
  );
}

function AttentionSection({ items }: { items: AttentionItem[] }) {
  const titleId = useId();
  if (items.length === 0) {
    return <EmptyWidgetCard widget="attention" title="Requiere atención" text="Todo al día" />;
  }
  return (
    <section aria-labelledby={titleId} data-slot="inicio-attention" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold">
          Requiere atención
        </h2>
        <Link
          href="/tareas?mostrar=en_retraso"
          className={cn("rounded-sm text-[13px] text-muted-foreground hover:underline", FOCUS_RING)}
        >
          Ver todas →
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.slice(0, ATTENTION_CAP).map((item, i) => (
          <AttentionCard key={item.id} item={item} index={i} />
        ))}
      </ul>
    </section>
  );
}

// ── Agenda de hoy ────────────────────────────────────────────────────────────

function agendaMeta(item: AgendaItem): string {
  return [item.project, item.tramo ? tramoLabel(item.tramo) : null].filter(Boolean).join(" · ");
}

function AgendaCard({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) {
    return <EmptyWidgetCard widget="todayAgenda" title="Agenda de hoy" text="Sin eventos hoy" />;
  }
  const shown = items.slice(0, AGENDA_CAP);
  return (
    <WidgetCard
      title="Agenda de hoy"
      actions={
        items.length > AGENDA_CAP ? (
          <Link href="/mi-espacio" className={cn("rounded-sm text-[13px] text-muted-foreground hover:underline", FOCUS_RING)}>
            Ver agenda
          </Link>
        ) : undefined
      }
    >
      <ol data-slot="inicio-agenda" className="flex flex-col">
        {shown.map((item, i) => {
          const color = tramoColor(item.tramo);
          const last = i === shown.length - 1;
          return (
            <li key={item.id} className={cn("flex gap-3", !last && "pb-3.5")}>
              <span aria-hidden="true" className="flex flex-col items-center pt-1">
                <span
                  className="size-3 shrink-0 rounded-full border-[3px]"
                  style={{ backgroundColor: color, borderColor: tintOf(color, 30) }}
                />
                {last ? null : <span data-slot="agenda-connector" className="mt-1 w-0.5 flex-1 bg-border" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {item.allDay ? "Todo el día" : agendaTime(item.start)}
                </span>
                <span className="line-clamp-2 text-sm font-medium">{item.title}</span>
                {agendaMeta(item) ? (
                  <span className="truncate text-[12.5px] text-muted-foreground">{agendaMeta(item)}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </WidgetCard>
  );
}

// ── Proyectos en curso ───────────────────────────────────────────────────────

const RING_R = 22;

function ProjectRing({ pct, colorVar, index }: { pct: number; colorVar: string; index: number }) {
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <span className="relative flex size-[52px] shrink-0 items-center justify-center">
      <svg aria-hidden="true" viewBox="0 0 52 52" className="absolute inset-0 size-full -rotate-90">
        <circle cx={26} cy={26} r={RING_R} fill="none" stroke="var(--muted)" strokeWidth={6} />
        <circle
          className="ring"
          cx={26}
          cy={26}
          r={RING_R}
          fill="none"
          stroke={colorVar}
          strokeWidth={6}
          strokeLinecap="round"
          pathLength={100}
          style={{ ...staggerStyle(index, 60), "--ring-offset": 100 - value } as CSSProperties}
        />
      </svg>
      <span className="font-mono text-[11px] font-medium tabular-nums">{value}%</span>
    </span>
  );
}

function ProjectCard({ item, index }: { item: ProgressItem; index: number }) {
  const chip = projectChip(item);
  return (
    <li className="min-w-0">
      <Link
        href={item.href ?? `/proyectos/${encodeURIComponent(item.id)}`}
        data-slot="project-card"
        className={cn(
          "anim-in flex h-full items-center gap-3.5 rounded-[10px] border border-accent bg-card p-3.5 text-card-foreground",
          LIFT_CLASS,
          FOCUS_RING,
        )}
        style={staggerStyle(index, 60)}
      >
        <ProjectRing pct={item.real} colorVar={item.colorVar ?? "var(--chart-1)"} index={index} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-semibold">{item.label}</span>
          {projectMeta(item) ? (
            <span className="truncate text-[12.5px] text-muted-foreground">{projectMeta(item)}</span>
          ) : null}
          <span className="flex flex-wrap items-center gap-2">
            <AvatarStack people={item.team ?? []} cap={PROJECT_AVATAR_CAP} size="card" />
            <span
              data-slot="project-chip"
              data-tone={chip.tone}
              className={cn(
                "inline-flex items-center rounded-full px-2 py-px text-xs font-medium",
                chip.tone === "destructive" ? "bg-tint-destructive text-destructive-ink" : "bg-tint-success text-success",
              )}
            >
              {chip.text}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

function ProjectsCard({ items }: { items: ProgressItem[] }) {
  if (items.length === 0) {
    return <EmptyWidgetCard widget="projectsProgress" title="Proyectos en curso" text="No hay proyectos activos" />;
  }
  const shown = sortProjects(items).slice(0, PROJECTS_CAP);
  return (
    <WidgetCard
      title="Proyectos en curso"
      actions={
        <Link href="/proyectos" className={cn("rounded-sm text-[13px] text-muted-foreground hover:underline", FOCUS_RING)}>
          Ver todos →
        </Link>
      }
    >
      <ul data-slot="inicio-projects" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((item, i) => (
          <ProjectCard key={item.id} item={item} index={i} />
        ))}
      </ul>
    </WidgetCard>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

/**
 * Inicio · Visual (#989, frame `Inicio-Visual`): the `visual` slot of
 * Inicio's `PageStyleLayout`. Header, greeting hero, four KPI tiles with
 * sparklines, "Ritmo semanal" and "Tareas por tramo", "Requiere atención"
 * cards, then "Agenda de hoy" and "Proyectos en curso". Everything comes from
 * `qk.inicio()`; the team agenda and the hero avatars need team access
 * (`openShifts` is null without it, so the viewer's own day is shown).
 */
export function InicioVisual({ data, me, renderedAt }: InicioVisualProps) {
  const greeting = `${greetingFor(renderedAt)}, ${me.firstName}`;
  const teamView = data.openShifts !== null;
  const agenda: AgendaItem[] = teamView ? data.todayAgenda : data.myDay;

  return (
    <div data-slot="inicio-visual" className="flex flex-col gap-5">
      <PageHeader
        title={greeting}
        description={visualHeaderDescription(renderedAt)}
        actions={
          <Link href="/tareas?nueva=1" className={buttonVariants()}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            Nueva tarea
          </Link>
        }
      />

      <Hero data={data} greeting={greeting} renderedAt={renderedAt} />

      <KpiTiles kpis={data.kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PaceCard weeks={data.weeklyPace} />
        <TramoCard segments={data.tasksByTramo} />
      </div>

      <AttentionSection items={data.attention} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <AgendaCard items={agenda} />
        <ProjectsCard items={data.projectsProgress} />
      </div>
    </div>
  );
}
