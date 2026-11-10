"use client";

import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  NO_TRAMO_KEY,
  NO_UPCOMING_DELIVERY,
  PROJECTS_TITLE,
  activeOnlyProjects,
  attentionProjects,
  deliveryTimeline,
  formatDeliveryDate,
  moveProjectToTramo,
  orderedTramos,
  portfolioBoard,
  portfolioById,
  tramoSummaries,
  tramoTone,
  visualDescription,
  type AttentionProject,
  type BoardCard,
  type BoardColumn,
  type TramoStep,
  type TramoSummary,
  type TramoTone,
} from "@/components/proyectos/projects-portfolio-data";
import { EmptyState } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/shadcn/avatar";
import { Button } from "@/components/ui/shadcn/button";
import { ProjectsVisualSkeleton } from "@/components/widgets/route-skeletons";
import { DeliveryTimelineWidget } from "@/components/widgets/DeliveryTimelineWidget";
import { PageHeader } from "@/components/widgets/PageHeader";
import { PortfolioBoardWidget } from "@/components/widgets/PortfolioBoardWidget";
import { setProjectCurrentTramoAction } from "@/lib/actions/projects-actions";
import { actionErrorCode } from "@/lib/errors";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { proyectosPageOptions } from "@/lib/query/options/proyectos";
import { selectSelectedTramo, useProyectosDashboard } from "@/lib/stores/proyectos-dashboard-store";
import { staggerStyle } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

/**
 * /proyectos in Visual (#992, frame `Proyectos-Visual`): boards, charts and
 * motion over the one `qk.proyectos.list()` read (prefetched by the page).
 * Five sections in frame order:
 *
 * 1. `PageHeader`: "{n} obras activas en {t} tramos · {k} entregas en los
 *    próximos 11 días." and "Nuevo proyecto" (`onNewProject`).
 * 2. Tramo summary: one toggle card per tramo (open tasks, average progress
 *    bar, overdue). Pressing one sets `selectedKpi` (session only); the board
 *    then shows only that column and the timeline only that tramo.
 * 3. "Requieren atención": up to three projects with overdue tasks.
 * 4. "Tablero del portafolio" (`PortfolioBoardWidget`): drag a project to
 *    another tramo (`setProjectCurrentTramoAction`, optimistic over
 *    `qk.proyectos.list()`, rolled back with a toast on error). Only with
 *    `canChangeProjectStage`.
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
export const SUMMARY_SECTION_LABEL = "Portafolio por tramo";
export const ATTENTION_TITLE = "Requieren atención";
export const ATTENTION_LINK_LABEL = "Ver todos →";
export const ATTENTION_LINK_HREF = "/proyectos?estilo=analitico&mostrar=vencidas";
export const BOARD_TITLE = "Tablero del portafolio";
export const BOARD_HINT = "Arrastra un proyecto para moverlo de tramo";
export const TIMELINE_TITLE = "Próximas entregas";

/** Visual section entrance: each section rises 60 ms after the one before. */
const SECTION_STEP_MS = 60;

/** Toast and live-region copy of a failed move, by action error code. */
export function moveErrorText(err: unknown): string {
  switch (actionErrorCode(err)) {
    case "FORBIDDEN":
      return "No tienes permiso para mover proyectos";
    case "NOT_STARTED":
      return "Ese tramo aún no ha iniciado en este proyecto";
    default:
      return "No se pudo mover el proyecto";
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

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
    <div role="img" aria-label={`Tramo actual: ${current}`} className="flex items-center" data-slot="tramo-stepper">
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

function SummaryCard({
  summary,
  index,
  tone,
  pressed,
  onToggle,
}: {
  summary: TramoSummary;
  index: number;
  tone: TramoTone;
  pressed: boolean;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      data-slot="tramo-summary"
      data-tramo={summary.key}
      className={cn(
        "anim-in lift flex min-w-0 flex-col gap-3 rounded-[14px] border border-t-4 bg-card px-5 py-[18px] text-left text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        pressed && "outline-2 outline-offset-2 outline-ring",
      )}
      style={{ borderTopColor: tone.color, ...staggerStyle(index, 80) }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold" style={{ color: tone.ink }}>
          {summary.label}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {plural(summary.projectCount, "proyecto", "proyectos")}
        </span>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[34px] font-semibold leading-none tabular-nums">{summary.openTasks}</span>
        <span className="text-[13px] text-muted-foreground">tareas abiertas</span>
      </span>
      <span
        role="img"
        aria-label={`Avance medio ${summary.avgProgress} %`}
        className="block h-2 overflow-hidden rounded-full"
        style={{ background: tone.soft }}
      >
        <span
          className="grow-x block h-full rounded-full"
          style={{ width: `${summary.avgProgress}%`, background: tone.color, "--anim-delay": `${200 + 80 * index}ms` } as CSSProperties}
        />
      </span>
      <span className="text-[12.5px] text-muted-foreground">
        Avance medio <b className="font-mono font-semibold tabular-nums text-foreground">{summary.avgProgress} %</b> ·{" "}
        {summary.overdue > 0 ? (
          <span className="font-mono tabular-nums text-destructive">{plural(summary.overdue, "vencida", "vencidas")}</span>
        ) : (
          "al día"
        )}
      </span>
    </button>
  );
}

function AttentionCard({ project, index, toneOf }: { project: AttentionProject; index: number; toneOf(key: string | null): TramoTone }) {
  const tone = toneOf(project.tramoKey);
  const current = project.steps.find((s) => s.state === "current")?.label ?? project.badge.split(" · ")[0];
  const names = project.team.map((p) => p.name).join(", ");
  return (
    <Link
      href={`/proyectos/${project.id}`}
      data-slot="attention-card"
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
        {project.steps.length > 0 ? <TramoStepper steps={project.steps} current={current} toneOf={toneOf} /> : null}
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
}

// ── Layout ─────────────────────────────────────────────────────────────────

type MoveVars = { id: string; workflowId: string };

function VisualPortfolio({ data, onNewProject }: { data: ProyectosPageData; onNewProject?(): void }) {
  const { projects, portfolio, tramos, today, canCreateProject, canChangeProjectStage } = data;
  const attentionId = useId();
  const boardId = useId();
  const selectedKpi = useProyectosDashboard(selectSelectedTramo);
  const toggleKpi = useProyectosDashboard((s) => s.toggleKpi);
  const [announcement, setAnnouncement] = useState("");

  const listed = useMemo(() => activeOnlyProjects(projects), [projects]);
  const rows = useMemo(() => portfolioById(portfolio), [portfolio]);
  const tramoOrder = useMemo(() => orderedTramos(listed, tramos), [listed, tramos]);
  const summaries = useMemo(() => tramoSummaries(listed, rows, tramos), [listed, rows, tramos]);
  const attention = useMemo(() => attentionProjects(listed, rows, tramos), [listed, rows, tramos]);
  const board = useMemo(() => portfolioBoard(listed, rows, tramos), [listed, rows, tramos]);
  const timeline = useMemo(() => deliveryTimeline(listed, rows, today), [listed, rows, today]);

  // A selection from another layout that names no card here applies to nothing.
  const selected = selectedKpi !== null && summaries.some((s) => s.key === selectedKpi) ? selectedKpi : null;
  const shownColumns = selected === null ? board : board.filter((c) => c.key === selected);
  const shownItems =
    selected === null ? timeline.items : timeline.items.filter((item) => (item.tramoKey ?? NO_TRAMO_KEY) === selected);

  const toneOf = (key: string | null) => tramoTone(key, tramoOrder);
  const tramosWithProjects = summaries.filter((s) => s.key !== NO_TRAMO_KEY && s.projectCount > 0).length;

  const move = useActionMutation(({ id, workflowId }: MoveVars) => setProjectCurrentTramoAction(id, workflowId), {
    optimistic: {
      onMutate: async (qc, { id, workflowId }) => {
        await qc.cancelQueries({ queryKey: qk.proyectos.list() });
        const previous = qc.getQueryData<ProyectosPageData>(qk.proyectos.list());
        if (previous) qc.setQueryData(qk.proyectos.list(), moveProjectToTramo(previous, id, workflowId));
        return { previous };
      },
      rollback: (qc, snap) => {
        if (snap.previous) qc.setQueryData(qk.proyectos.list(), snap.previous);
      },
    },
    // The copy depends on the error code: shown by the call's own onError.
    onFormError: () => undefined,
    invalidate: ({ id }) => [qk.proyectos.list(), qk.proyectos.shell(id), qk.proyectos.resumen(id)],
  });

  function handleMove(card: BoardCard, _from: BoardColumn, to: BoardColumn) {
    if (!canChangeProjectStage || !to.tramoId) return;
    setAnnouncement(`${card.name} movido a ${to.label}`);
    move.mutate(
      { id: card.id, workflowId: to.tramoId },
      {
        onError: (err) => {
          const text = moveErrorText(err);
          toast.error(text);
          setAnnouncement(text);
        },
      },
    );
  }

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

  // Sections rise in one after another (summary, attention, board, timeline).
  const boardIndex = attention.length > 0 ? 2 : 1;

  return (
    <div className="flex min-w-0 flex-col gap-5" data-slot="projects-visual">
      <PageHeader
        title={PROJECTS_TITLE}
        description={visualDescription(listed.length, tramosWithProjects, timeline.items.length)}
        actions={newButton}
      />

      <section
        aria-label={SUMMARY_SECTION_LABEL}
        data-section="summary"
        className="rise grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
        style={staggerStyle(0, SECTION_STEP_MS)}
      >
        {summaries.map((summary, index) => (
          <SummaryCard
            key={summary.key}
            summary={summary}
            index={index}
            tone={toneOf(summary.key)}
            pressed={selected === summary.key}
            onToggle={() => toggleKpi(summary.key)}
          />
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
              <AttentionCard key={project.id} project={project} index={index} toneOf={toneOf} />
            ))}
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby={boardId}
        data-section="board"
        className="rise flex flex-col gap-3.5"
        style={staggerStyle(boardIndex, SECTION_STEP_MS)}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={boardId} className="text-lg font-semibold">
            {BOARD_TITLE}
          </h2>
          {canChangeProjectStage ? <span className="text-[12.5px] text-muted-foreground">{BOARD_HINT}</span> : null}
        </div>
        <PortfolioBoardWidget
          columns={shownColumns}
          toneOf={toneOf}
          canMove={canChangeProjectStage}
          onMove={handleMove}
          announcement={announcement}
          onAnnounce={setAnnouncement}
          lastColumnFooter={
            canCreateProject ? (
              <Button type="button" variant="outline" className="h-11 border-dashed" onClick={() => onNewProject?.()}>
                <Plus aria-hidden="true" />
                {VISUAL_NEW_PROJECT_LABEL}
              </Button>
            ) : null
          }
        />
      </section>

      <DeliveryTimelineWidget
        title={TIMELINE_TITLE}
        days={timeline.days}
        items={shownItems}
        rangeLabel={timeline.rangeLabel}
        toneOf={toneOf}
        legend={tramoOrder.map((t) => ({ key: t.key, label: t.name }))}
        enterIndex={boardIndex + 1}
      />
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
