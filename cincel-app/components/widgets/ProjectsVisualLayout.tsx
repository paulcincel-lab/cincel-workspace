"use client";

import { useId, useMemo, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FolderKanban, Plus } from "lucide-react";

import {
  NO_UPCOMING_DELIVERY,
  PROJECTS_TITLE,
  activeOnlyProjects,
  attentionProjects,
  deliveryTimeline,
  formatDeliveryDate,
  orderedTramos,
  portfolioById,
  portfolioProjectCards,
  portfolioSummary,
  summaryTone,
  tramoTone,
  visualDescription,
  type AttentionProject,
  type PortfolioSummaryCard,
  type TramoStep,
  type TramoTone,
} from "@/components/proyectos/projects-portfolio-data";
import { EmptyState } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/shadcn/avatar";
import { Button } from "@/components/ui/shadcn/button";
import { ProjectsVisualSkeleton } from "@/components/widgets/route-skeletons";
import { DeliveryTimelineWidget } from "@/components/widgets/DeliveryTimelineWidget";
import { PageHeader } from "@/components/widgets/PageHeader";
import { RowActionsMenu } from "@/components/widgets/RowActionsMenu";
import type { TableRowAction } from "@/components/widgets/table-rows";
import { useDeleteProject } from "@/components/proyectos/use-delete-project";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { proyectosPageOptions } from "@/lib/query/options/proyectos";
import { staggerStyle } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

/**
 * /proyectos in Visual (#992, frame `Proyectos-Visual`): boards, charts and
 * motion over the one `qk.proyectos.list()` read (prefetched by the page).
 * Five sections in frame order:
 *
 * 1. `PageHeader`: "{n} obras activas en {t} tramos · {k} entregas en los
 *    próximos 11 días." and "Nuevo proyecto" (`onNewProject`).
 * 2. Portfolio summary (#1042): four cards (Proyectos activos, Tareas
 *    abiertas, Vencidas, Avance medio), each with its bar and footnote.
 * 3. "Requieren atención": up to three projects with overdue tasks.
 * 4. "Todos los proyectos" (#1042): one card per project (the attention
 *    card without the tramo stepper; the tramo is only its chip), by name.
 *    A card opens the project. Tramo is never a grouping here: it changes
 *    from the Tramo actual cell in Analítico or from the project.
 * 5. "Próximas entregas" (`DeliveryTimelineWidget`): today … today + 10.
 *
 * Only `activo` projects are shown (paused ones are reachable from
 * Analítico). Budget is never shown here.
 */
export type ProjectsVisualLayoutProps = {
  /** Opens the create dialog. */
  onNewProject?(): void;
};

export const VISUAL_ERROR_TITLE = "No se pudieron cargar los proyectos";
export const VISUAL_EMPTY_TITLE = "Aún no hay proyectos";
export const VISUAL_EMPTY_DESCRIPTION = "Crea el primero para empezar a darle seguimiento.";
export const VISUAL_NEW_PROJECT_LABEL = "Nuevo proyecto";
export const SUMMARY_SECTION_LABEL = "Resumen del portafolio";
export const ATTENTION_TITLE = "Requieren atención";
export const ATTENTION_LINK_LABEL = "Ver todos →";
export const ATTENTION_LINK_HREF = "/proyectos?estilo=analitico&mostrar=vencidas";
export const PROJECTS_GRID_TITLE = "Todos los proyectos";
export const TIMELINE_TITLE = "Próximas entregas";

/** Visual section entrance: each section rises 60 ms after the one before. */
const SECTION_STEP_MS = 60;

// ── Loading ────────────────────────────────────────────────────────────────

export { ProjectsVisualSkeleton };

// ── Pieces ─────────────────────────────────────────────────────────────────

function ProgressRing({ value, tone }: { value: number; tone: TramoTone }) {
  return (
    <div role="img" aria-label={`Avance ${value} %`} className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" aria-hidden="true" className="size-full -rotate-90">
        <circle cx="32" cy="32" r="24" fill="none" strokeWidth="6" style={{ stroke: tone.soft }} />
        <circle
          cx="32"
          cy="32"
          r="24"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={100}
          className="ring"
          style={
            {
              stroke: tone.color,
              strokeDasharray: 100,
              strokeDashoffset: 100 - value,
              "--ring-offset": 100 - value,
            } as CSSProperties
          }
        />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center font-mono text-[13px] font-medium tabular-nums">
        {value} %
      </span>
    </div>
  );
}

function TramoStepper({ steps, current, toneOf }: { steps: TramoStep[]; current: string; toneOf(key: string): TramoTone }) {
  return (
    <div role="img" aria-label={`Etapa actual: ${current}`} className="flex items-center" data-slot="tramo-stepper">
      {steps.map((step, index) => {
        const tone = toneOf(step.key);
        const filled = step.state !== "next";
        return (
          <span key={step.key} className={cn("flex items-center", index > 0 && "flex-1")} aria-hidden="true">
            {index > 0 ? (
              <span
                className="h-[3px] flex-1 rounded-full"
                style={{ background: filled ? tone.color : "var(--border)" }}
              />
            ) : null}
            <span
              data-state={step.state}
              title={step.label}
              className={cn(
                "shrink-0 rounded-full",
                step.state === "current" ? "size-3.5" : "size-2.5",
                step.state === "next" && "border-2 border-border bg-card",
              )}
              style={
                filled
                  ? { background: tone.color, boxShadow: step.state === "current" ? `0 0 0 4px ${tone.soft}` : undefined }
                  : undefined
              }
            />
          </span>
        );
      })}
    </div>
  );
}

function SummaryCard({ card, index }: { card: PortfolioSummaryCard; index: number }) {
  const tone = summaryTone(card.tone);
  return (
    <div
      data-slot="portfolio-summary"
      data-summary={card.key}
      className="anim-in lift flex min-w-0 flex-col gap-3 rounded-[14px] border border-t-4 bg-card px-5 py-[18px] text-left text-foreground"
      style={{ borderTopColor: tone.color, ...staggerStyle(index, 80) }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold" style={{ color: tone.ink }}>
          {card.label}
        </span>
        {card.aside ? <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{card.aside}</span> : null}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[34px] font-semibold leading-none tabular-nums">{card.value}</span>
        {card.unit ? <span className="text-[13px] text-muted-foreground">{card.unit}</span> : null}
      </span>
      <span role="img" aria-label={card.barLabel} className="block h-2 overflow-hidden rounded-full" style={{ background: tone.soft }}>
        <span
          className="grow-x block h-full rounded-full"
          style={{ width: `${card.bar}%`, background: tone.color, "--anim-delay": `${200 + 80 * index}ms` } as CSSProperties}
        />
      </span>
      <span className="text-[12.5px] text-muted-foreground">
        {card.footnote.lead}
        {card.footnote.figure ? (
          <>
            {" "}
            <b className={cn("font-mono font-semibold tabular-nums", card.footnote.tone === "destructive" ? "text-destructive" : "text-foreground")}>
              {card.footnote.figure}
            </b>
          </>
        ) : null}
      </span>
    </div>
  );
}

/** A project card: "Requieren atención" (with the tramo stepper) and the project grid (`steps` false). */
function ProjectCard({
  project,
  index,
  toneOf,
  slot = "attention-card",
  steps = true,
  actions = [],
}: {
  project: AttentionProject;
  index: number;
  toneOf(key: string | null): TramoTone;
  slot?: string;
  steps?: boolean;
  /** The card's `⋯` entries ("Eliminar proyecto", #1050); none hides the menu. */
  actions?: TableRowAction[];
}) {
  const tone = toneOf(project.tramoKey);
  const current = project.steps.find((s) => s.state === "current")?.label ?? project.badge.split(" · ")[0];
  const names = project.team.map((p) => p.name).join(", ");
  const card = (
    <Link
      href={`/proyectos/${project.id}`}
      data-slot={slot}
      data-project={project.id}
      className="anim-in lift flex min-w-0 flex-col overflow-hidden rounded-[14px] border bg-card text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      style={staggerStyle(index, 80)}
    >
      <div
        className="flex h-28 items-end justify-between gap-3 px-[18px] py-4"
        style={{
          backgroundColor: tone.soft,
          backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${tone.color} 11%, transparent) 0 2px, transparent 2px 14px)`,
        }}
      >
        <span aria-hidden="true" className="text-[40px] font-semibold leading-none" style={{ color: tone.ink }}>
          {project.initials}
        </span>
        <span
          className="flex min-w-0 items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-semibold"
          style={{ color: tone.ink }}
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: tone.color }} />
          <span className="truncate" title={project.badge}>
            {project.badge}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-3.5 p-[18px]">
        <div className="flex min-w-0 items-center gap-3.5">
          <ProgressRing value={project.real} tone={tone} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[17px] font-semibold" title={project.name}>
              {project.name}
            </span>
            {project.subtitle ? (
              <span className="truncate text-[12.5px] text-muted-foreground" title={project.subtitle}>
                {project.subtitle}
              </span>
            ) : null}
          </div>
        </div>
        {steps && project.steps.length > 0 ? <TramoStepper steps={project.steps} current={current} toneOf={toneOf} /> : null}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-muted px-2.5 py-[3px] text-[12.5px] font-medium">
              <span className="font-mono tabular-nums">{project.open}</span> {project.open === 1 ? "abierta" : "abiertas"}
            </span>
            <span className="rounded-full bg-tint-destructive px-2.5 py-[3px] text-[12.5px] font-medium text-destructive-ink">
              <span className="font-mono tabular-nums">{project.overdue}</span> {project.overdue === 1 ? "vencida" : "vencidas"}
            </span>
          </div>
          {project.team.length > 0 ? (
            <AvatarGroup role="img" aria-label={`Equipo: ${names}`} className="shrink-0 *:data-[slot=avatar]:ring-card">
              {project.team.map((person) => (
                <Avatar key={person.id} aria-hidden="true" className="size-7" title={person.name}>
                  <AvatarFallback className="text-[11px] font-semibold" style={{ background: tone.soft, color: tone.ink }}>
                    {person.initials}
                  </AvatarFallback>
                </Avatar>
              ))}
              {project.teamOverflow > 0 ? (
                <AvatarGroupCount aria-hidden="true" className="size-7 text-[11px] font-semibold">
                  +{project.teamOverflow}
                </AvatarGroupCount>
              ) : null}
            </AvatarGroup>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-2 border-t border-muted pt-3 text-[12.5px]">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {project.nextDelivery ? (
            <span className="min-w-0 truncate" title={`${project.nextDelivery.title} · ${formatDeliveryDate(project.nextDelivery.date)}`}>
              {project.nextDelivery.title} ·{" "}
              <span className="font-mono tabular-nums">{formatDeliveryDate(project.nextDelivery.date)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{NO_UPCOMING_DELIVERY}</span>
          )}
        </div>
      </div>
    </Link>
  );
  if (actions.length === 0) return card;
  // The menu sits beside the link (not inside it), over the card's top-right corner.
  return (
    <div className="group/row relative flex min-w-0 flex-col *:flex-1">
      {card}
      <div className="absolute top-2 right-2 rounded-md bg-card">
        <RowActionsMenu rowLabel={project.name} actions={actions} />
      </div>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────

function VisualPortfolio({ data, onNewProject }: { data: ProyectosPageData; onNewProject?(): void }) {
  const { projects, portfolio, tramos, today, canCreateProject } = data;
  const attentionId = useId();
  const gridId = useId();

  const listed = useMemo(() => activeOnlyProjects(projects), [projects]);
  const rows = useMemo(() => portfolioById(portfolio), [portfolio]);
  const tramoOrder = useMemo(() => orderedTramos(listed, tramos), [listed, tramos]);
  const summary = useMemo(() => portfolioSummary(listed, rows), [listed, rows]);
  const attention = useMemo(() => attentionProjects(listed, rows, tramos), [listed, rows, tramos]);
  const cards = useMemo(() => portfolioProjectCards(listed, rows, tramos), [listed, rows, tramos]);
  const timeline = useMemo(() => deliveryTimeline(listed, rows, today), [listed, rows, today]);

  const toneOf = (key: string | null) => tramoTone(key, tramoOrder);
  // Card menu "Eliminar proyecto" (#1050), only with `canDeleteProject`.
  const deleteProject = useDeleteProject();

  const newButton = canCreateProject ? (
    <Button type="button" onClick={() => onNewProject?.()}>
      <Plus aria-hidden="true" />
      {VISUAL_NEW_PROJECT_LABEL}
    </Button>
  ) : undefined;

  if (listed.length === 0) {
    return (
      <div className="flex flex-col gap-5" data-slot="projects-visual">
        <PageHeader title={PROJECTS_TITLE} actions={newButton} />
        <EmptyState
          icon={FolderKanban}
          title={VISUAL_EMPTY_TITLE}
          description={canCreateProject ? VISUAL_EMPTY_DESCRIPTION : undefined}
          action={canCreateProject ? { label: VISUAL_NEW_PROJECT_LABEL, onClick: () => onNewProject?.() } : undefined}
        />
      </div>
    );
  }

  // Sections rise in one after another (summary, attention, projects, timeline).
  const gridIndex = attention.length > 0 ? 2 : 1;

  return (
    <div className="flex min-w-0 flex-col gap-5" data-slot="projects-visual">
      <PageHeader
        title={PROJECTS_TITLE}
        description={visualDescription(listed.length, timeline.items.length)}
        actions={newButton}
      />

      <section
        aria-label={SUMMARY_SECTION_LABEL}
        data-section="summary"
        className="rise grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
        style={staggerStyle(0, SECTION_STEP_MS)}
      >
        {summary.map((card, index) => (
          <SummaryCard key={card.key} card={card} index={index} />
        ))}
      </section>

      {attention.length > 0 ? (
        <section
          aria-labelledby={attentionId}
          data-section="attention"
          className="rise flex flex-col gap-3.5"
          style={staggerStyle(1, SECTION_STEP_MS)}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={attentionId} className="text-lg font-semibold">
              {ATTENTION_TITLE}
            </h2>
            <Link href={ATTENTION_LINK_HREF} className="text-[13px] text-muted-foreground hover:text-foreground">
              {ATTENTION_LINK_LABEL}
            </Link>
          </div>
          <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
            {attention.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={index}
                toneOf={toneOf}
                actions={deleteProject.rowActions({ id: project.id, name: project.name })}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby={gridId}
        data-section="projects"
        className="rise flex flex-col gap-3.5"
        style={staggerStyle(gridIndex, SECTION_STEP_MS)}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={gridId} className="text-lg font-semibold">
            {PROJECTS_GRID_TITLE}
          </h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {cards.length} {cards.length === 1 ? "proyecto" : "proyectos"}
          </span>
        </div>
        <div data-slot="project-grid" className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
          {cards.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              toneOf={toneOf}
              slot="project-card"
              steps={false}
              actions={deleteProject.rowActions({ id: project.id, name: project.name })}
            />
          ))}
          {canCreateProject ? (
            <Button type="button" variant="outline" className="h-auto min-h-28 border-dashed" onClick={() => onNewProject?.()}>
              <Plus aria-hidden="true" />
              {VISUAL_NEW_PROJECT_LABEL}
            </Button>
          ) : null}
        </div>
      </section>

      <DeliveryTimelineWidget
        title={TIMELINE_TITLE}
        days={timeline.days}
        items={timeline.items}
        rangeLabel={timeline.rangeLabel}
        toneOf={toneOf}
        legend={tramoOrder.map((t) => ({ key: t.key, label: t.name }))}
        enterIndex={gridIndex + 1}
      />
      {deleteProject.dialog}
    </div>
  );
}

export function ProjectsVisualLayout({ onNewProject }: ProjectsVisualLayoutProps = {}): ReactNode {
  const query = useQuery(proyectosPageOptions());
  if (query.isPending) return <ProjectsVisualSkeleton />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={PROJECTS_TITLE} />
        <ErrorState title={VISUAL_ERROR_TITLE} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  return <VisualPortfolio data={query.data} onNewProject={onNewProject} />;
}
