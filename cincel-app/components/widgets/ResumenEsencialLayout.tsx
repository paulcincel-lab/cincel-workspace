"use client";

import { Fragment, Suspense, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@/components/shell/ErrorState";
import { ProjectNoEtapa } from "@/components/proyectos/ProjectNoEtapa";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
  RESUMEN_ESENCIAL_FILES,
  RESUMEN_ESENCIAL_NEXT_TASKS,
  ResumenEsencialSkeleton,
} from "@/components/widgets/route-skeletons";
import { TaskSheetRoute, taskSheetHref } from "@/components/tareas/TaskSheet";
import { useQuickAddCreate } from "@/components/tareas/quick-add-create";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { EsencialItemRow, type EsencialStatus } from "@/components/widgets/EsencialItemRow";
import { QuickAddRow, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import {
  esencialEtapaLine,
  recentFileRows,
  shortDate,
  teamLine,
  type EsencialEtapaStep,
  type NextTask,
  type ProjectSummaryInput,
  type RecentFileRow,
  type TeamAvatar,
} from "@/lib/proyectos/project-summary";
import { EMPTY_RESUMEN_SUMMARY, resumenAvatarEtapa, resumenEtapaProgress, type ResumenTareasSummary } from "@/lib/proyectos/resumen-summary";
import { proyectoResumenSummaryOptions } from "@/lib/query/options/proyectos";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { etapaColorVar } from "@/lib/etapas/compat";
import type { WorkflowRef } from "@/lib/types/core";
import { cn } from "@/lib/utils";

/**
 * Proyecto · Resumen in the Esencial style (frame `ProyectoResumen-Esencial`):
 * four soft cards, dots and one or two numbers per group, no tables or
 * charts. Etapa line, Próximas tareas (five rows and the quick-add), Equipo
 * and the three newest Drive files. Reads `qk.proyectos.resumen(id)` (passed
 * in as `data`) and the task numbers `qk.proyectos.resumenSummary(id)`
 * (server aggregates, prefetched by the page, so the first render makes no
 * call; never the task list, #1051).
 */
export type ResumenEsencialLayoutProps = { data: ProjectSummaryInput };

export { RESUMEN_ESENCIAL_FILES, RESUMEN_ESENCIAL_NEXT_TASKS };
export const SECTION_ERROR_TITLE = "No se pudo cargar esta sección";
export const QUICK_ADD_HINT = "@persona · #fase · viernes";

/** Card shell shared by the four cards: 14 px radius, `card`, 1 px `border`, the theme's card shadow. */
const CARD = "rounded-lg border border-border bg-card text-card-foreground shadow-(--shadow-card)";
const HEADER_LINK =
  "text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:underline";

// ── Etapa colors (chart tokens through `lib/etapas/compat`) ─────────────────

type EtapaTone = { color: string; ink: string; tint: string };

const TINT_BY_SLOT: Record<string, string> = {
  "1": "bg-tint-primary",
  "2": "bg-tint-violet",
  "3": "bg-tint-warning",
  "4": "bg-tint-cyan",
  "5": "bg-tint-success",
};

function etapaTone(key: string | null, catalog: WorkflowRef[]): EtapaTone {
  if (!key) return { color: "var(--muted-foreground)", ink: "var(--foreground)", tint: "bg-muted" };
  const sortOrder = catalog.find((t) => t.key === key)?.sortOrder;
  const color = etapaColorVar(key, sortOrder);
  const slot = /--chart-(\d)\)/.exec(color)?.[1] ?? null;
  return slot
    ? { color, ink: `var(--chart-${slot}-ink)`, tint: TINT_BY_SLOT[slot] ?? "bg-muted" }
    : { color, ink: "var(--foreground)", tint: "bg-muted" };
}

// ── 1. Etapa card ────────────────────────────────────────────────────────────

function EtapaDot({ step, tone }: { step: EsencialEtapaStep; tone: EtapaTone }) {
  if (step.state === "next") {
    return <span aria-hidden="true" data-state="next" className="size-3.5 shrink-0 rounded-full border-2 border-border bg-card" />;
  }
  if (step.state === "current") {
    return (
      <span
        aria-hidden="true"
        data-state="current"
        className="size-[18px] shrink-0 rounded-full"
        style={{ background: tone.color, boxShadow: `0 0 0 5px color-mix(in srgb, ${tone.color} 20%, transparent)` }}
      />
    );
  }
  return <span aria-hidden="true" data-state="done" className="size-3.5 shrink-0 rounded-full" style={{ background: tone.color }} />;
}

function connectorStyle(step: EsencialEtapaStep, tone: EtapaTone): CSSProperties {
  if (step.state === "done") return { background: tone.color };
  if (step.state === "current") {
    const pct = Math.max(0, Math.min(100, step.pct));
    return { background: `linear-gradient(90deg, ${tone.color} ${pct}%, var(--border) ${pct}%)` };
  }
  return { background: "var(--border)" };
}

function StepDetail({ step }: { step: EsencialEtapaStep }) {
  if (!step.detail) return null;
  if (step.state === "done") {
    return (
      <span className="block">
        <span className="font-mono tabular-nums">{step.pct} %</span>
        {step.overdue > 0 ? (
          <>
            {" · "}
            <span className="text-warning">
              <span className="font-mono tabular-nums">{step.overdue}</span> {step.overdue === 1 ? "vencida" : "vencidas"}
            </span>
          </>
        ) : null}
      </span>
    );
  }
  return <span className={cn("block", step.state === "current" && "text-foreground")}>{step.detail}</span>;
}

function EtapaCard({ data, summary }: { data: ProjectSummaryInput; summary: ResumenTareasSummary }) {
  const line = useMemo(
    () => esencialEtapaLine(data, resumenEtapaProgress(summary, data.etapaCatalog, data.project)),
    [data, summary],
  );
  const tones = line.steps.map((step) => etapaTone(step.key, data.etapaCatalog));
  const noEtapa = line.steps.every((step) => step.state === "next");
  // No started etapa (#1043): the empty state instead of a line of suggested etapas.
  if (line.steps.length === 0) {
    return (
      <section aria-label="Etapas" className={cn(CARD, "anim-in")}>
        <ProjectNoEtapa projectId={data.project.id} etapas={data.etapaCatalog} />
      </section>
    );
  }
  return (
    <section aria-label="Etapas" className={cn(CARD, "anim-in flex flex-col gap-3.5 px-6 py-[22px]")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-foreground">{line.title}</h2>
        <p className="text-[13px] text-muted-foreground">
          Avance <b className="font-mono font-semibold text-foreground tabular-nums">{line.real} %</b>
        </p>
      </div>
      <div role="img" aria-label={line.ariaLabel} className="flex items-center gap-2">
        {line.steps.map((step, i) => (
          <Fragment key={step.key}>
            <EtapaDot step={noEtapa ? { ...step, state: "next" } : step} tone={tones[i]!} />
            {i < line.steps.length - 1 ? (
              <span
                aria-hidden="true"
                data-slot="etapa-connector"
                className="h-[3px] min-w-4 flex-1 rounded-full"
                style={connectorStyle(step, tones[i]!)}
              />
            ) : null}
          </Fragment>
        ))}
        {line.next ? (
          <span aria-hidden="true" data-slot="etapa-next" className="shrink-0 text-[12.5px] text-muted-foreground">
            Siguiente: {line.next.label}
          </span>
        ) : null}
      </div>
      {line.steps.length > 0 ? (
        <div
          aria-hidden="true"
          className="grid gap-2 text-[11.5px] text-muted-foreground sm:text-[12.5px]"
          style={{ gridTemplateColumns: `repeat(${line.steps.length}, minmax(0, 1fr))` }}
        >
          {line.steps.map((step, i) => (
            <div key={step.key} className="min-w-0 break-words">
              <span
                className={cn("block", step.state === "current" && "font-semibold")}
                style={step.state === "current" ? { color: tones[i]!.ink } : undefined}
              >
                {step.label}
              </span>
              {noEtapa ? null : <StepDetail step={step} />}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ── 2a. Próximas tareas ──────────────────────────────────────────────────────

function taskStatus(task: NextTask): EsencialStatus {
  if (task.daysLate > 0) return { kind: "text", label: `${task.daysLate} d tarde`, tone: "destructive", chip: true };
  if (task.blocked) return { kind: "text", label: "Bloqueada", tone: "destructive", chip: true };
  if (task.dueDate) return { kind: "text", label: shortDate(task.dueDate), tone: "muted" };
  return null;
}

/** A task the quick-add just created, shown on top until the next refetch. */
type CreatedTask = { id: string; title: string; etapaKey: string | null };

function NextTasksCard({
  data,
  summary,
  canCreate,
  tareasHref,
}: {
  data: ProjectSummaryInput;
  summary: ResumenTareasSummary;
  canCreate: boolean;
  tareasHref: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { create } = useQuickAddCreate();
  // Rows created here, tied to the summary they were added to: a refetch of the
  // summary replaces them (the list trims back to five).
  const [created, setCreated] = useState<{ summary: ResumenTareasSummary; rows: CreatedTask[] }>(() => ({ summary, rows: [] }));
  const pending = created.summary === summary ? created.rows : [];
  const [createdIds, setCreatedIds] = useState<ReadonlySet<string>>(() => new Set());

  const next = useMemo(() => summary.next.slice(0, RESUMEN_ESENCIAL_NEXT_TASKS), [summary]);
  const listed = new Set(next.map((t) => t.id));
  const extra = pending.filter((t) => !listed.has(t.id));
  const currentKey = data.project.currentWorkflow?.key ?? null;

  async function onCreate(draft: QuickAddDraft) {
    const row = await create(draft);
    const etapaKey = data.etapaCatalog.find((t) => t.id === draft.etapaId)?.key ?? currentKey;
    setCreated((prev) => ({
      summary,
      rows: [{ id: row.id, title: row.title, etapaKey }, ...(prev.summary === summary ? prev.rows : [])],
    }));
    setCreatedIds((ids) => new Set(ids).add(row.id));
    return row;
  }

  const dot = (key: string | null) => (
    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: etapaTone(key, data.etapaCatalog).color }} />
  );

  const empty = next.length === 0 && extra.length === 0;
  return (
    <EsencialCard
      title="Próximas tareas"
      action={
        <Link href={tareasHref} className={HEADER_LINK}>
          Ver todas →
        </Link>
      }
    >
      {empty ? <p className="py-2 text-[13px] text-muted-foreground">Sin tareas abiertas</p> : null}
      {!empty ? (
        <ul className="flex flex-col">
          {extra.map((task) => (
            <li key={task.id}>
              <EsencialItemRow
                title={task.title}
                href={taskSheetHref(pathname, searchParams, task.id)}
                leading={dot(task.etapaKey)}
                status={null}
                isNew
              />
            </li>
          ))}
          {next.map((task) => (
            <li key={task.id}>
              <EsencialItemRow
                title={task.title}
                href={taskSheetHref(pathname, searchParams, task.id)}
                leading={dot(task.etapaKey)}
                meta={task.responsable ? [{ key: "responsable", label: task.responsable.name }] : []}
                status={taskStatus(task)}
                isNew={createdIds.has(task.id)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {canCreate ? (
        <div className="mt-2.5">
          <QuickAddRow
            variant="card"
            context={{
              label: data.project.name,
              projectId: data.project.id,
              etapaId: data.project.currentWorkflowId,
              placeholder: `Agregar una tarea a ${data.project.name}`,
            }}
            onCreate={onCreate}
          />
          <p aria-hidden="true" className="mt-1 text-right font-mono text-[11.5px] text-muted-foreground">
            {QUICK_ADD_HINT}
          </p>
        </div>
      ) : null}
    </EsencialCard>
  );
}

// ── 2b. Equipo ───────────────────────────────────────────────────────────────

function Avatar({ avatar, catalog }: { avatar: TeamAvatar; catalog: WorkflowRef[] }) {
  const tone = etapaTone(avatar.etapaKey, catalog);
  return (
    <span
      title={avatar.name}
      className={cn(
        "-ml-2 inline-flex size-9 items-center justify-center rounded-full font-mono text-[12.5px] font-semibold ring-2 ring-card first:ml-0",
        tone.tint,
        !avatar.etapaKey && "text-muted-foreground",
      )}
      style={avatar.etapaKey ? { color: tone.ink } : undefined}
    >
      {avatar.initials}
    </span>
  );
}

function TeamCard({ data, summary, fichaHref }: { data: ProjectSummaryInput; summary: ResumenTareasSummary; fichaHref: string }) {
  const team = useMemo(() => {
    const line = teamLine(data.project);
    const avatars = line.avatars.map((avatar) => ({ ...avatar, etapaKey: resumenAvatarEtapa(summary, avatar.id) }));
    return { ...line, avatars };
  }, [data.project, summary]);
  const count = team.avatars.length + team.overflow;

  return (
    <EsencialCard title="Equipo">
      {count === 0 ? (
        <div className="flex flex-col items-start gap-1 text-[13px]">
          <p className="text-muted-foreground">Sin equipo asignado</p>
          <Link href={fichaHref} className={HEADER_LINK}>
            Editar en Ficha
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <Link href={fichaHref} aria-label={`Equipo: ${team.text}. Ver en Ficha`} className="flex w-fit items-center rounded-full">
            {team.avatars.map((avatar) => (
              <Avatar key={avatar.id} avatar={avatar} catalog={data.etapaCatalog} />
            ))}
            {team.overflow > 0 ? (
              <span className="-ml-2 inline-flex size-9 items-center justify-center rounded-full bg-muted font-mono text-[12.5px] font-semibold text-muted-foreground ring-2 ring-card">
                +{team.overflow}
              </span>
            ) : null}
          </Link>
          <p className="text-[13px] text-muted-foreground">
            {team.manager ? (
              <>
                Responsable: <b className="font-medium text-foreground">{team.manager}</b> ·{" "}
              </>
            ) : (
              <>Sin responsable · </>
            )}
            <span className="font-mono tabular-nums">{count}</span> {count === 1 ? "persona" : "personas"}
          </p>
        </div>
      )}
    </EsencialCard>
  );
}

// ── 2c. Archivos ─────────────────────────────────────────────────────────────

const FILE_TILE: Record<string, { className: string; ink?: string }> = {
  PDF: { className: "bg-secondary text-secondary-foreground" },
  DWG: { className: "bg-tint-violet", ink: "var(--chart-2-ink)" },
  JPG: { className: "bg-tint-cyan", ink: "var(--chart-4-ink)" },
  JPEG: { className: "bg-tint-cyan", ink: "var(--chart-4-ink)" },
  PNG: { className: "bg-tint-cyan", ink: "var(--chart-4-ink)" },
  XLSX: { className: "bg-tint-success text-success" },
  XLS: { className: "bg-tint-success text-success" },
};
const FILE_TILE_OTHER = { className: "bg-muted text-muted-foreground" };

function FileRow({ file }: { file: RecentFileRow }) {
  const tile = FILE_TILE[file.ext] ?? FILE_TILE_OTHER;
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] font-mono text-[10px] font-semibold", tile.className)}
        style={tile.ink ? { color: tile.ink } : undefined}
      >
        {file.ext.slice(0, 4)}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{file.name}</span>
      <span className="shrink-0 font-mono text-[12px] text-muted-foreground tabular-nums">{file.when}</span>
    </>
  );
  return (
    <li>
      {file.href ? (
        <a
          href={file.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 py-2 text-[13.5px] underline-offset-4 hover:underline focus-visible:underline"
        >
          {body}
        </a>
      ) : (
        <div className="flex items-center gap-2.5 py-2 text-[13.5px]">{body}</div>
      )}
    </li>
  );
}

function FilesCard({ data, archivosHref }: { data: ProjectSummaryInput; archivosHref: string }) {
  const [now] = useState(() => new Date());
  const files = useMemo(() => recentFileRows(data.files, now, RESUMEN_ESENCIAL_FILES), [data.files, now]);
  const driveUrl = data.driveFolderUrl ?? null;
  return (
    <section aria-label="Archivos recientes" className={cn(CARD, "flex flex-col px-[22px] py-5")}>
      <div className="flex items-baseline justify-between gap-2 pb-2">
        <h2 className="text-[15px] font-semibold text-foreground">Archivos</h2>
        {driveUrl ? (
          <a href={driveUrl} target="_blank" rel="noopener noreferrer" className={HEADER_LINK}>
            Abrir Drive →
          </a>
        ) : null}
      </div>
      {files === null ? (
        <p className="text-[13px] text-muted-foreground">No se pudo leer la carpeta de Drive</p>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-start gap-1 text-[13px]">
          <p className="text-muted-foreground">Este proyecto aún no tiene archivos</p>
          <Link href={archivosHref} className={HEADER_LINK}>
            Subir archivos
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col">
          {files.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── States ───────────────────────────────────────────────────────────────────

function SectionError({ label, onRetry }: { label: string; onRetry(): void }) {
  return (
    <section aria-label={label} className={cn(CARD, "px-[22px] py-5")}>
      <ErrorState title={SECTION_ERROR_TITLE} onRetry={onRetry} />
    </section>
  );
}

export { ResumenEsencialSkeleton };

function NextTasksSkeleton() {
  return (
    <section aria-label="Próximas tareas" aria-busy="true" className={cn(CARD, "flex flex-col gap-2 px-[22px] py-5")}>
      {Array.from({ length: RESUMEN_ESENCIAL_NEXT_TASKS }, (_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </section>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

export function ResumenEsencialLayout({ data }: ResumenEsencialLayoutProps): ReactNode {
  const id = data.project.id;
  const tareas = useQuery(proyectoResumenSummaryOptions(id));
  const summary = tareas.data ?? EMPTY_RESUMEN_SUMMARY;
  const user = useSessionStore(selectAuthenticatedUser);
  const canCreate = useMemo(() => resolveActivitiesCapabilities(user).canCreateActivity, [user]);
  const searchParams = useSearchParams();

  const base = `/proyectos/${encodeURIComponent(id)}`;
  const estilo = searchParams.get("estilo");
  const keep = estilo ? `?estilo=${encodeURIComponent(estilo)}` : "";
  const retry = () => void tareas.refetch();

  return (
    <div data-style="esencial" className="flex flex-col gap-5">
      {tareas.isError ? (
        <SectionError label="Etapas" onRetry={retry} />
      ) : (
        <EtapaCard data={data} summary={summary} />
      )}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col">
          {tareas.isError ? (
            <SectionError label="Próximas tareas" onRetry={retry} />
          ) : tareas.isPending ? (
            <NextTasksSkeleton />
          ) : (
            <NextTasksCard data={data} summary={summary} canCreate={canCreate} tareasHref={`${base}/tareas${keep}`} />
          )}
        </div>
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <TeamCard data={data} summary={summary} fichaHref={`${base}/ficha${keep}`} />
          <FilesCard data={data} archivosHref={`${base}/archivos${keep}`} />
        </div>
      </div>

      <Suspense fallback={null}>
        <TaskSheetRoute />
      </Suspense>
    </div>
  );
}
