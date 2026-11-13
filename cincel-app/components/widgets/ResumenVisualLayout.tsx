"use client";

import Link from "next/link";
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { FileText } from "lucide-react";

import { EmptyState } from "@/components/shell/EmptyState";
import { ProjectNoEtapa } from "@/components/proyectos/ProjectNoEtapa";
import { ErrorState } from "@/components/shell/ErrorState";
import { Button } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { QuickAddRow, type QuickAddCreated, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { NEUTRAL_TONE, ringOffset, etapaTone, type EtapaTone } from "@/components/widgets/resumen-tones";
import { SCurveWidget } from "@/components/widgets/SCurveWidget";
import { StatusDonutWidget } from "@/components/widgets/StatusDonutWidget";
import { TeamLoadWidget } from "@/components/widgets/TeamLoadWidget";
import { zonedIsoDate } from "@/lib/dates/zoned-formatters";
import {
  activityItems,
  fileTypeLabel,
  nextEtapaHint,
  RESUMEN_NO_ETAPA,
  shortDate,
  TEAM_LOAD_MAX,
  type ActivityItem,
  type NextTask,
  type ProjectSummaryInput,
  type EtapaProgress,
} from "@/lib/proyectos/project-summary";
import {
  resumenHeroCounts,
  resumenNextCards,
  resumenStatusCounts,
  resumenTeamLoadCards,
  resumenEtapaProgress,
  type ResumenTareasSummary,
} from "@/lib/proyectos/resumen-summary";
import type { HistoryEvent } from "@/lib/types/core";
import type { StaffFileItem } from "@/lib/types/workspace-access";
import { initialsOf } from "@/lib/people/aggregates";
import { staggerStyle } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

/**
 * Proyecto · Resumen, Visual style (frame `ProyectoResumen-Visual`): charts
 * and motion. In order: the progress hero (ring, current etapa, etapa track,
 * chips), three cards (tareas por estatus, avance por etapa, equipo y carga),
 * the S-curve against plan, "Lo que sigue" with the quick-add and "Actividad
 * reciente", and the recent Drive files. The counts, etapa bars and next
 * tasks come from the server's task numbers (`qk.proyectos.resumenSummary(id)`,
 * #1051), which a quick-add refreshes. Budget data is never
 * rendered here. Every chart has `role="img"`, a label and a visually hidden
 * table with the same numbers.
 */
export type ResumenVisualHistory = {
  events: HistoryEvent[];
  status: "pending" | "error" | "success";
  onRetry(): void;
};

export type ResumenVisualLayoutProps = {
  data: ProjectSummaryInput;
  /** The task numbers (`qk.proyectos.resumenSummary(id)`): counts, etapa bars, team, next tasks. */
  summary: ResumenTareasSummary;
  history: ResumenVisualHistory;
  /** `activities.canCreateActivity`: "Nueva tarea" and the quick-add. */
  canCreate: boolean;
  onQuickAdd(draft: QuickAddDraft): Promise<QuickAddCreated>;
  /** Opens the new-task sheet preset with this project. */
  onNewTask(): void;
  /** Ids of tasks just created through the quick-add: listed first with `row-new`. */
  recentIds?: readonly string[];
  /** Clock of the relative dates; defaults to the first render's time. */
  now?: Date;
};

const RESUMEN_TIMEZONE = "America/Mexico_City";
const NEXT_TASKS = 4;
const ACTIVITY_ITEMS = 5;
const RECENT_FILES = 6;
/** Section entrance stagger (frame: 60 ms). */
const SECTION_STEP_MS = 60;

const CARD = "rounded-[14px] border border-border bg-card text-card-foreground shadow-(--shadow-card)";
const LINK = "text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const NEW_TAB = "(se abre en una pestaña nueva)";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function etapaLine(step: EtapaProgress): string {
  if (step.state === "done") return `${step.pct} %${step.open > 0 ? ` · ${plural(step.open, "pendiente", "pendientes")}` : ""}`;
  if (step.state === "current") return `${step.pct} % · en curso`;
  return step.startsOn ? `Inicia ${shortDate(step.startsOn)}` : "Sin iniciar";
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero({
  data,
  progress,
  tone,
  counts,
}: {
  data: ProjectSummaryInput;
  progress: EtapaProgress[];
  tone: EtapaTone;
  counts: { open: number; overdue: number; blocked: number };
}) {
  const { project, portfolio, taskStats, schedule, etapaCatalog } = data;
  const real = Math.max(0, Math.min(100, Math.round(portfolio?.real ?? project.progress)));
  const plan = schedule && portfolio?.plan != null ? Math.round(portfolio.plan) : null;
  const current = progress.find((step) => step.state === "current") ?? null;
  const nextEtapa = nextEtapaHint(etapaCatalog, project);
  const next = portfolio?.nextDelivery ?? null;
  const chipBase = "inline-flex items-center rounded-full px-3 py-[5px] text-[13px] font-medium";

  return (
    <section
      aria-label="Avance del proyecto"
      className={cn(CARD, "rise flex flex-wrap items-center justify-center gap-8 px-8 py-7 sm:justify-start")}
      style={{ ...staggerStyle(0, SECTION_STEP_MS), backgroundImage: `radial-gradient(circle at 100% 0, ${tone.soft}, transparent 40%)` }}
    >
      <div className="relative size-40 flex-none">
        <svg
          width="160"
          height="160"
          viewBox="0 0 160 160"
          role="img"
          aria-label={plan === null ? `Avance ${real} %` : `Avance ${real} %, plan ${plan} %`}
        >
          <circle cx="80" cy="80" r="60" fill="none" stroke={tone.soft} strokeWidth="14" />
          <circle
            className="ring"
            cx="80"
            cy="80"
            r="60"
            fill="none"
            stroke={tone.color}
            strokeWidth="14"
            strokeLinecap="round"
            pathLength={100}
            transform="rotate(-90 80 80)"
            style={{ ["--ring-offset" as string]: ringOffset(real) } as CSSProperties}
          />
        </svg>
        <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="font-mono text-[34px] font-semibold leading-none tabular-nums text-foreground">{real} %</span>
          {plan !== null ? <span className="font-mono text-[11px] text-muted-foreground">PLAN {plan} %</span> : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-[18px]">
        {progress.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-muted-foreground">Etapa actual</span>
            <span className="text-[22px] font-semibold" style={{ color: tone.ink }}>
              {current ? [current.label, taskStats.currentPhase].filter(Boolean).join(" · ") : "Sin etapa asignada"}
            </span>
          </div>
        ) : (
          // No started etapa (#1043): no suggested track, the empty state with "Iniciar una etapa".
          <ProjectNoEtapa projectId={project.id} etapas={etapaCatalog} />
        )}

        {progress.length > 0 ? (
          <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {progress.map((step) => {
              const stepTone = etapaTone(step.key, etapaCatalog);
              return (
                <li key={step.etapaId} className="flex min-w-0 flex-col gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn("block h-2 overflow-hidden rounded-full", step.state === "next" && "bg-muted")}
                    style={
                      step.state === "done"
                        ? { background: stepTone.color }
                        : step.state === "current"
                          ? { background: stepTone.soft }
                          : undefined
                    }
                  >
                    {step.state === "current" ? (
                      <span
                        className="grow-x block h-full rounded-full"
                        style={{ width: `${step.pct}%`, background: stepTone.color, ["--anim-delay" as string]: "300ms" }}
                      />
                    ) : null}
                  </span>
                  <span
                    className="truncate text-[13px] font-semibold"
                    style={{ color: step.state === "next" ? "var(--foreground)" : stepTone.ink }}
                  >
                    {step.label}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{etapaLine(step)}</span>
                </li>
              );
            })}
            {nextEtapa ? (
              <li data-slot="etapa-next" className="flex min-w-0 flex-col justify-end gap-1.5">
                <span className="truncate text-[13px] text-muted-foreground">Siguiente: {nextEtapa.name}</span>
              </li>
            ) : null}
          </ol>
        ) : null}

        <ul className="flex flex-wrap gap-2" aria-label="Indicadores">
          {counts.open > 0 ? (
            <li className={cn(chipBase, "bg-muted text-foreground")}>{plural(counts.open, "tarea abierta", "tareas abiertas")}</li>
          ) : null}
          {counts.overdue > 0 ? (
            <li className={cn(chipBase, "bg-tint-destructive text-destructive-ink")}>{plural(counts.overdue, "vencida", "vencidas")}</li>
          ) : null}
          {counts.blocked > 0 ? (
            <li className={cn(chipBase, "bg-tint-warning text-warning-ink")}>{plural(counts.blocked, "bloqueada", "bloqueadas")}</li>
          ) : null}
          {next ? (
            <li className={cn(chipBase, "bg-secondary text-secondary-foreground")}>
              Próxima: {lowerFirst(next.title)} · <span className="ml-1 font-mono tabular-nums">{shortDate(next.date)}</span>
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}

// ── Etapa bars ──────────────────────────────────────────────────────────────

function EtapaBars({ progress, data }: { progress: EtapaProgress[]; data: ProjectSummaryInput }) {
  const label = `Avance por etapa: ${progress.map((step) => `${step.label} ${step.pct} %`).join(", ")}`;
  return (
    <>
      <div role="img" aria-label={label} className="flex flex-col gap-3.5">
        {progress.map((step, index) => {
          const tone = etapaTone(step.key, data.etapaCatalog);
          return (
            <div key={step.etapaId} aria-hidden="true" className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate text-foreground">{step.label}</span>
                <span className="font-mono tabular-nums text-foreground">{step.pct} %</span>
              </div>
              <span className="block h-3 overflow-hidden rounded-full" style={{ background: tone.soft }}>
                <span
                  className="grow-x block h-full rounded-full"
                  style={{ width: `${step.pct}%`, background: tone.color, ...staggerStyle(index, 80) }}
                />
              </span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>Avance por etapa</caption>
        <thead>
          <tr>
            <th scope="col">Etapa</th>
            <th scope="col">Avance</th>
            <th scope="col">Tareas</th>
          </tr>
        </thead>
        <tbody>
          {progress.map((step) => (
            <tr key={step.etapaId}>
              <th scope="row">{step.label}</th>
              <td>{step.pct} %</td>
              <td>{step.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function SectionCard({
  title,
  index,
  className,
  children,
}: {
  title: string;
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(CARD, "rise lift flex min-w-0 flex-col gap-4 p-[22px]", className)}
      style={staggerStyle(index, SECTION_STEP_MS)}
    >
      <h2 id={id} className="text-[15px] font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Lo que sigue ────────────────────────────────────────────────────────────

function dueText(task: NextTask): string | null {
  if (!task.dueDate) return null;
  return task.daysLate > 0 ? `${shortDate(task.dueDate)} · ${task.daysLate} d` : shortDate(task.dueDate);
}

function NextTaskCard({ task, tone, isNew }: { task: NextTask; tone: EtapaTone; isNew: boolean }) {
  const due = dueText(task);
  const pct = task.subtasks.total > 0 ? Math.round((task.subtasks.done / task.subtasks.total) * 100) : 0;
  return (
    <li className="min-w-0">
      <Link
        href={`/tareas?tarea=${encodeURIComponent(task.id)}`}
        className={cn(
          CARD,
          "lift flex h-full flex-col gap-2.5 border-t-4 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          isNew && "row-new",
        )}
        style={{ borderTopColor: tone.color }}
      >
        <span className="line-clamp-2 text-sm font-semibold text-foreground">{task.title}</span>
        <span className="flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
            {task.responsable ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-flex size-[22px] flex-none items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: tone.soft, color: tone.ink }}
                >
                  {initialsOf(task.responsable.name)}
                </span>
                <span className="truncate">{task.responsable.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Sin responsable</span>
            )}
          </span>
          {task.blocked ? (
            <span className="flex-none rounded-full bg-tint-destructive px-2 py-0.5 text-[11.5px] font-semibold text-destructive-ink">
              Bloqueado
            </span>
          ) : due ? (
            <span className={cn("flex-none font-mono tabular-nums", task.daysLate > 0 ? "text-destructive" : "text-muted-foreground")}>
              {due}
              {task.daysLate > 0 ? <span className="sr-only"> de retraso</span> : null}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full" style={{ background: tone.soft }}>
          {task.subtasks.total > 0 ? (
            <span className="grow-x block h-full rounded-full" style={{ width: `${pct}%`, background: tone.color }} />
          ) : null}
        </span>
        {task.subtasks.total > 0 ? (
          <span className="sr-only">
            {task.subtasks.done} de {task.subtasks.total} subtareas
          </span>
        ) : null}
      </Link>
    </li>
  );
}

// ── Actividad reciente ──────────────────────────────────────────────────────

function ActivityList({ items, history, data }: { items: ActivityItem[]; history: ResumenVisualHistory; data: ProjectSummaryInput }) {
  if (history.status === "pending") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  if (history.status === "error") {
    return <ErrorState title="No se pudo cargar esta sección" onRetry={history.onRetry} />;
  }
  if (items.length === 0) return <p className="py-2 text-sm text-muted-foreground">Aún no hay actividad</p>;
  return (
    <ol className="flex flex-col">
      {items.map((item) => {
        const objectTone = item.objectTone === "etapa" ? etapaTone(item.etapaKey ?? null, data.etapaCatalog) : NEUTRAL_TONE;
        const actor = item.actor?.name ?? "Sistema";
        return (
          <li key={item.id} className="flex gap-3 border-b border-muted py-2.5 last:border-b-0">
            <span
              aria-hidden="true"
              className="inline-flex size-[30px] flex-none items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground"
            >
              {initialsOf(actor)}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] text-foreground">
                <strong className="font-semibold">{actor}</strong> {item.verb}
                {item.object ? (
                  <>
                    {" "}
                    <strong
                      className={cn("font-semibold", item.objectTone === "destructive" && "text-destructive")}
                      style={item.objectTone === "etapa" ? { color: objectTone.ink } : undefined}
                    >
                      {item.object}
                    </strong>
                  </>
                ) : null}
              </span>
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {[item.when, item.etapaLabel].filter(Boolean).join(" · ")}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ── Archivos ────────────────────────────────────────────────────────────────

/** Tinted preview tile per mime family (token pairs). */
function previewTone(file: StaffFileItem): { background: string; color: string } {
  const mime = file.mimeType;
  const name = file.name.toLowerCase();
  if (mime.startsWith("image/")) return { background: "var(--tint-violet)", color: "var(--chart-2-ink)" };
  if (mime.includes("pdf")) return { background: "var(--tint-warning)", color: "var(--warning-ink)" };
  if (mime.includes("sheet") || name.endsWith(".xlsx") || name.endsWith(".csv"))
    return { background: "var(--tint-primary)", color: "var(--secondary-foreground)" };
  if (name.endsWith(".dwg") || name.endsWith(".dxf")) return { background: "var(--tint-cyan)", color: "var(--chart-4-ink)" };
  return { background: "var(--muted)", color: "var(--foreground)" };
}

/** "4.2 MB", "180 KB" (es-MX decimals). */
function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("es-MX", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

function fileDay(iso: string, now: Date): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return zonedIsoDate(at, RESUMEN_TIMEZONE) === zonedIsoDate(now, RESUMEN_TIMEZONE) ? "hoy" : shortDate(zonedIsoDate(at, RESUMEN_TIMEZONE));
}

function FilesSection({ data, now, index }: { data: ProjectSummaryInput; now: Date; index: number }) {
  const archivosHref = `/proyectos/${encodeURIComponent(data.project.id)}/archivos`;
  const files = data.files
    ? [...data.files]
        .filter((item) => item.kind === "file")
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
        .slice(0, RECENT_FILES)
    : null;
  const driveUrl = data.driveFolderUrl ?? null;

  return (
    <section aria-labelledby="resumen-visual-archivos" className="rise flex flex-col gap-3" style={staggerStyle(index, SECTION_STEP_MS)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="resumen-visual-archivos" className="text-[15px] font-semibold text-foreground">
          Archivos
        </h2>
        {driveUrl && files ? (
          <a href={driveUrl} target="_blank" rel="noopener" className={LINK}>
            Abrir en Drive →<span className="sr-only"> {NEW_TAB}</span>
          </a>
        ) : null}
      </div>
      {files === null ? (
        <div className={cn(CARD, "p-[22px]")}>
          <EmptyState icon={FileText} title="No se pudo leer la carpeta de Drive" action={{ label: "Abrir Archivos", href: archivosHref }} />
        </div>
      ) : files.length === 0 ? (
        <div className={cn(CARD, "p-[22px]")}>
          <EmptyState icon={FileText} title="Este proyecto aún no tiene archivos" action={{ label: "Subir archivos", href: archivosHref }} />
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(170px,100%),1fr))] gap-3.5">
          {files.map((file) => {
            const tone = previewTone(file);
            const size = file.sizeBytes === null ? null : fileSize(file.sizeBytes);
            const meta = [size, fileDay(file.modifiedAt, now)].filter(Boolean).join(" · ");
            const body = (
              <>
                {file.thumbnailLink ? (
                  // Drive thumbnails are remote, short-lived links: not an optimizable asset.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={file.thumbnailLink}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-[104px] w-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-[104px] items-center justify-center font-mono text-[11.5px] font-semibold"
                    style={tone}
                  >
                    {fileTypeLabel(file)}
                  </span>
                )}
                <span className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
                  <span className="truncate text-[13px] font-medium text-foreground">{file.name}</span>
                  <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">{meta}</span>
                </span>
              </>
            );
            const tile = cn(
              CARD,
              "lift flex h-full flex-col overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            );
            return (
              <li key={file.id} className="min-w-0">
                {file.webViewLink ? (
                  <a href={file.webViewLink} target="_blank" rel="noopener" className={tile}>
                    {body}
                    <span className="sr-only">{NEW_TAB}</span>
                  </a>
                ) : (
                  <Link href={archivosHref} className={tile}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function ResumenVisualLayout({
  data,
  summary,
  history,
  canCreate,
  onQuickAdd,
  onNewTask,
  recentIds = [],
  now: nowProp,
}: ResumenVisualLayoutProps): ReactNode {
  const [firstRender] = useState(() => new Date());
  const now = nowProp ?? firstRender;
  const { project, today, etapaCatalog } = data;

  const progress = useMemo(() => resumenEtapaProgress(summary, etapaCatalog, project), [summary, etapaCatalog, project]);
  const counts = useMemo(() => resumenStatusCounts(summary), [summary]);
  const team = useMemo(() => resumenTeamLoadCards(data, summary), [data, summary]);
  const activity = useMemo(() => activityItems(history.events, etapaCatalog, now, ACTIVITY_ITEMS), [history.events, etapaCatalog, now]);

  const current = progress.find((step) => step.state === "current") ?? null;
  const tone = current ? etapaTone(current.key, etapaCatalog) : NEUTRAL_TONE;
  const heroCounts = resumenHeroCounts(summary);

  // Just-created tasks first (with `row-new`), then the urgency order.
  const recent = new Set(recentIds);
  const next = resumenNextCards(summary, recentIds, NEXT_TASKS);

  const projectHref = `/proyectos/${encodeURIComponent(project.id)}`;
  const hasSCurve = data.schedule !== null;

  return (
    <div className="flex flex-col gap-6">
      <Hero data={data} progress={progress} tone={tone} counts={heroCounts} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-[18px]">
        <SectionCard title="Tareas por estatus" index={1}>
          <StatusDonutWidget
            counts={counts}
            empty={
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">Este proyecto aún no tiene tareas</p>
                {canCreate ? (
                  <Button type="button" onClick={onNewTask}>
                    Nueva tarea
                  </Button>
                ) : null}
              </div>
            }
          />
        </SectionCard>
        <SectionCard title="Avance por etapa" index={2}>
          {progress.length > 0 ? (
            <EtapaBars progress={progress} data={data} />
          ) : (
            <p className="text-sm text-muted-foreground">{RESUMEN_NO_ETAPA}</p>
          )}
        </SectionCard>
        <SectionCard title="Equipo y carga" index={3}>
          {team.length > 0 ? (
            <TeamLoadWidget people={team} etapaCatalog={etapaCatalog} max={TEAM_LOAD_MAX} moreHref={`${projectHref}/ficha`} />
          ) : (
            <p className="text-sm text-muted-foreground">Este proyecto aún no tiene equipo</p>
          )}
        </SectionCard>
      </div>

      {hasSCurve ? (
        <SCurveWidget schedule={data.schedule} today={today} color={tone === NEUTRAL_TONE ? "var(--primary)" : tone.color} className="rise" style={staggerStyle(4, SECTION_STEP_MS)} />
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-[18px]">
        <section aria-labelledby="resumen-visual-sigue" className="rise flex min-w-0 flex-col gap-3" style={staggerStyle(5, SECTION_STEP_MS)}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="resumen-visual-sigue" className="text-[15px] font-semibold text-foreground">
              Lo que sigue
            </h2>
            <Link href={`${projectHref}/tareas`} className={LINK}>
              Ver tareas →
            </Link>
          </div>
          {next.length > 0 ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {next.map((task) => (
                <NextTaskCard key={task.id} task={task} tone={etapaTone(task.etapaKey, etapaCatalog)} isNew={recent.has(task.id)} />
              ))}
            </ul>
          ) : canCreate ? null : (
            <p className="text-sm text-muted-foreground">No hay tareas abiertas</p>
          )}
          {canCreate ? (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-dashed border-input bg-card px-4 py-3.5 text-[13.5px]">
              <div className="min-w-0 flex-1">
                <QuickAddRow
                  variant="card"
                  context={{
                    label: project.name,
                    projectId: project.id,
                    placeholder: `Nueva tarea en ${project.name}`,
                  }}
                  onCreate={onQuickAdd}
                />
              </div>
              <kbd
                aria-hidden="true"
                className="flex-none rounded-md border border-b-2 border-border px-1.5 py-px font-mono text-[11px] text-foreground"
              >
                / asistente
              </kbd>
            </div>
          ) : null}
        </section>

        <section
          aria-labelledby="resumen-visual-actividad"
          className={cn(CARD, "rise flex min-w-0 flex-col gap-3 p-[22px]")}
          style={staggerStyle(6, SECTION_STEP_MS)}
        >
          <h2 id="resumen-visual-actividad" className="text-[15px] font-semibold text-foreground">
            Actividad reciente
          </h2>
          <ActivityList items={activity} history={history} data={data} />
        </section>
      </div>

      <FilesSection data={data} now={now} index={7} />
    </div>
  );
}
