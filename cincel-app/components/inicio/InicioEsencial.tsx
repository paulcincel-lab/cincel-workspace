"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { newTaskInvalidations } from "@/components/tareas/NewTaskDialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { EsencialItemRow, type EsencialMeta } from "@/components/widgets/EsencialItemRow";
import { LineSeriesWidget, type LineSeries } from "@/components/widgets/LineSeriesWidget";
import { PageHeader } from "@/components/widgets/PageHeader";
import { QuickAddRow, type QuickAddCreated, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { StyleContent } from "@/components/widgets/StyleContent";
import { createUserTaskAction } from "@/lib/actions/tasks-actions";
import { agendaSortKey, agendaTaskId, shiftIsoDate, weekSundayOf } from "@/lib/dashboard/inicio";
import { localIsoDate } from "@/lib/dashboard/task-trend";
import { cachedDateTimeFormat } from "@/lib/dates/zoned-formatters";
import { formatInicioDate, greetingFor, INICIO_TIME_ZONE } from "@/lib/inicio/header";
import { ATTENTION_REASON } from "@/lib/metrics/widgets";
import { qk } from "@/lib/query/keys";
import { runAction, useActionMutation } from "@/lib/query/mutation";
import { catalogProjectOptionsOptions } from "@/lib/query/options/catalog";
import type { InicioPageData } from "@/lib/loaders/inicio";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { etapaColorVar, etapaLabel } from "@/lib/etapas/compat";
import type { TaskDetail, UserTaskInput } from "@/lib/types/core";
import type { InicioData } from "@/lib/types/redesign";
import type { AgendaItem, AttentionItem, ProgressItem } from "@/lib/types/widgets";

/**
 * Inicio · Esencial (frame `Inicio-Esencial`, #990): four soft cards with one
 * or two numbers each, in the 980 px column. "Lo que vence esta semana"
 * (`myWeek`, with the quick-add as its last line), "Requiere atención" (the
 * first 3 `attention` items), "Ritmo semanal" (the last bucket of
 * `weeklyPace` as a sentence plus a small line) and "Avance de proyectos"
 * (`projectsProgress` by progress). No tables and no chart motion.
 */
export type InicioEsencialProps = {
  data: InicioData;
  firstName: string;
  /** The instant the page was rendered at (greeting, date line, today). */
  now: Date;
  /** The caller's staff id: the quick-add's default assignee. */
  meId: string | null;
  /** Renders the card skeletons instead of the cards. */
  loading?: boolean;
};

export const ESENCIAL_COPY = {
  weekTitle: "Lo que vence esta semana",
  today: "Hoy",
  week: "Esta semana",
  weekEmpty: "Nada vence esta semana",
  quickAddLabel: "Agregar tarea",
  quickAddPlaceholder: "Escribe para agregar una tarea…",
  added: "Tarea agregada",
  attentionTitle: "Requiere atención",
  attentionEmpty: "Todo al día",
  paceTitle: "Ritmo semanal",
  paceEmpty: "Sin movimiento en las últimas semanas",
  projectsTitle: "Avance de proyectos",
  projectsEmpty: "No hay proyectos activos",
  projectsMore: "Ver todos →",
  atRisk: "En riesgo",
  blocked: "Bloqueado",
} as const;

/** Rows of "Esta semana" before "Ver N más". */
export const WEEK_VISIBLE = 6;
/** Attention rows shown. */
export const ATTENTION_VISIBLE = 3;
/** Project rows shown. */
export const PROJECTS_VISIBLE = 6;
/** Weeks of the Ritmo line. */
export const PACE_WEEKS = 8;
/** Destination of "Ver las N →". */
export const ATTENTION_OVERDUE_HREF = "/tareas?mostrar=en_retraso";

const TZ = INICIO_TIME_ZONE;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ── Copy helpers (pure) ─────────────────────────────────────────────────────

/** "Lunes 9 de noviembre · 3 cosas necesitan tu atención hoy." */
export function esencialDateLine(now: Date, attention: number): string {
  const date = formatInicioDate(now, TZ).replace(",", "");
  const day = date.charAt(0).toLocaleUpperCase("es-MX") + date.slice(1);
  const count =
    attention === 0
      ? "nada necesita tu atención hoy"
      : `${attention} ${plural(attention, "cosa necesita", "cosas necesitan")} tu atención hoy`;
  return `${day} · ${count}.`;
}

/** The time of an agenda start on its local day ("11:00"). */
export function agendaTime(item: Pick<AgendaItem, "start" | "allDay">): string {
  if (item.allDay) return "Todo el día";
  return agendaSortKey(item.start, TZ).slice(11, 16) || "—";
}

/** "jue 12" (es-MX, lowercase, no period). */
export function agendaWeekday(item: Pick<AgendaItem, "start">): string {
  const day = agendaSortKey(item.start, TZ).slice(0, 10);
  const at = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return "—";
  const weekday = cachedDateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" })
    .format(at)
    .replace(/\.$/, "")
    .toLocaleLowerCase("es-MX");
  return `${weekday} ${at.getUTCDate()}`;
}

/** The Ritmo numbers of the last week: completed, created and net (completed − created). */
export function paceSummary(weeks: InicioData["weeklyPace"]): { completed: number; created: number; net: number } | null {
  const recent = weeks.slice(-PACE_WEEKS);
  if (recent.length === 0 || recent.every((w) => w.completed === 0 && w.created === 0)) return null;
  const last = recent[recent.length - 1]!;
  return { completed: last.completed, created: last.created, net: last.completed - last.created };
}

/** "+2 esta semana" / "−3 esta semana" (true minus sign) / "0 esta semana", and the pill tone. */
export function pacePill(net: number): { label: string; tone: "success" | "warning" } {
  const sign = net > 0 ? "+" : net < 0 ? "−" : "";
  return { label: `${sign}${Math.abs(net)} esta semana`, tone: net >= 0 ? "success" : "warning" };
}

/** "Cerraste 11 tareas y entraron 9." for the caller's own scope, "Se cerraron …" for a team scope. */
export function paceSentence(pace: { completed: number; created: number }, scope: InicioData["paceScope"]): string {
  const { completed, created } = pace;
  const tasks = `${completed} ${plural(completed, "tarea", "tareas")}`;
  const closed = scope === "mine" ? `Cerraste ${tasks}` : `${plural(completed, "Se cerró", "Se cerraron")} ${tasks}`;
  return `${closed} y ${plural(created, "entró", "entraron")} ${created}.`;
}

/** Overdue attention items (the pill and "Ver las N →"). */
export function overdueAttention(items: AttentionItem[]): number {
  return items.filter((a) => a.daysLate !== null && a.daysLate > 0).length;
}

/** The meta of an attention row: etapa (or "Bloqueado"), project, then "12 días tarde" in destructive. */
export function attentionMeta(item: AttentionItem): EsencialMeta[] {
  const blocked = item.reason === ATTENTION_REASON.bloqueada;
  const meta: EsencialMeta[] = [
    {
      key: "etapa",
      label: blocked ? ESENCIAL_COPY.blocked : item.etapa ? etapaLabel(item.etapa) : item.reason,
      dot: blocked ? "var(--destructive)" : item.etapa ? etapaColorVar(item.etapa) : "var(--muted-foreground)",
    },
    { key: "project", label: item.project, tone: "muted" },
  ];
  if (item.daysLate !== null && item.daysLate > 0) {
    meta.push({ key: "late", label: `${item.daysLate} ${plural(item.daysLate, "día", "días")} tarde`, tone: "destructive" });
  } else if (!blocked && item.etapa) {
    meta.push({ key: "reason", label: item.reason, tone: "muted" });
  }
  return meta;
}

/** Projects by progress, highest first, at most `PROJECTS_VISIBLE`. */
export function projectsByProgress(items: ProgressItem[]): ProgressItem[] {
  return [...items].sort((a, b) => b.real - a.real || a.label.localeCompare(b.label, "es")).slice(0, PROJECTS_VISIBLE);
}

/**
 * Puts a just-created item into `myWeek`: in `today` when it is due today,
 * in `week` (by date and time) when due tomorrow to Sunday, nowhere after.
 */
export function insertMyWeekItem(myWeek: InicioData["myWeek"], item: AgendaItem, today: string): InicioData["myWeek"] {
  const day = agendaSortKey(item.start, TZ).slice(0, 10);
  const byStart = (a: AgendaItem, b: AgendaItem) =>
    agendaSortKey(a.start, TZ).localeCompare(agendaSortKey(b.start, TZ)) || a.title.localeCompare(b.title, "es");
  const total = myWeek.total + 1;
  if (day === today) return { ...myWeek, today: [...myWeek.today, item].sort(byStart), total };
  if (day >= shiftIsoDate(today, 1) && day <= weekSundayOf(today)) {
    return { ...myWeek, week: [...myWeek.week, item].sort(byStart), total };
  }
  return myWeek;
}

// ── Parts ───────────────────────────────────────────────────────────────────

function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span aria-hidden="true" className="shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: color }} />;
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="px-2 py-2.5 text-sm text-muted-foreground">{children}</p>;
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-medium text-secondary-foreground hover:underline">
      {children}
    </Link>
  );
}

function agendaRow(item: AgendaItem, right: string, isNew: boolean) {
  const color = item.etapa ? etapaColorVar(item.etapa) : "var(--muted-foreground)";
  return (
    <li key={item.id} title={item.title}>
      <EsencialItemRow
        title={item.title}
        href={item.href}
        leading={<Dot color={color} />}
        meta={item.project ? [{ key: "project", label: item.project, tone: "muted" }] : []}
        status={{ kind: "text", label: right, tone: "default" }}
        isNew={isNew}
      />
    </li>
  );
}

function AgendaGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col">
      <h3 className="px-2 pt-2.5 pb-1 text-xs font-semibold text-muted-foreground first:pt-1">{label}</h3>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

type CreateVars = { input: UserTaskInput; item: AgendaItem };

function WeekCard({ data, now, meId }: { data: InicioData; now: Date; meId: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const [announce, setAnnounce] = useState("");
  const today = localIsoDate(now, TZ);
  const projects = useQuery(catalogProjectOptionsOptions()).data ?? [];
  const openNewTask = useNewTaskUi((s) => s.openNewTask);

  const create = useActionMutation(
    ({ input }: CreateVars): Promise<TaskDetail> => runAction(createUserTaskAction, input),
    {
      invalidate: (vars) => newTaskInvalidations(vars.input.projectId),
      optimistic: {
        async onMutate(client, vars) {
          await client.cancelQueries({ queryKey: qk.inicio() });
          const before = client.getQueryData<InicioPageData>(qk.inicio());
          if (before) {
            client.setQueryData<InicioPageData>(qk.inicio(), {
              ...before,
              inicio: { ...before.inicio, myWeek: insertMyWeekItem(before.inicio.myWeek, vars.item, today) },
            });
          }
          return before;
        },
        rollback(client, before) {
          if (before) client.setQueryData(qk.inicio(), before);
        },
      },
    },
  );

  const { today: todayItems, week, total } = data.myWeek;
  const shownWeek = expanded ? week : week.slice(0, WEEK_VISIBLE);
  const hidden = week.length - shownWeek.length;
  const isNew = (item: AgendaItem) => newIds.has(item.id) || newIds.has(agendaTaskId(item) ?? "");

  async function onCreate(draft: QuickAddDraft): Promise<QuickAddCreated> {
    const project = draft.projectId ? projects.find((p) => p.id === draft.projectId) : undefined;
    const workflowId = draft.etapaId ?? project?.currentWorkflowId ?? null;
    if (!draft.projectId || !workflowId) {
      // No project (or etapa) to create in: the dialog takes over, prefilled.
      openNewTask({ title: draft.title, ...(draft.projectId ? { projectId: draft.projectId } : {}) }, "inicio");
      throw new Error("NEW_TASK_DIALOG");
    }
    const dueDate = draft.dueDate ?? today;
    const tempId = `nueva-${Date.now()}`;
    const item: AgendaItem = {
      id: tempId,
      title: draft.title,
      start: `${dueDate}T09:00`,
      estimated: true,
      project: project?.name,
    };
    setNewIds((prev) => new Set(prev).add(tempId));
    const task = await create.mutateAsync({
      input: {
        projectId: draft.projectId,
        title: draft.title,
        workflowId,
        managerId: draft.assigneeId ?? meId,
        priority: draft.priority,
        commitmentDate: dueDate,
      },
      item,
    });
    setNewIds((prev) => new Set(prev).add(task.id));
    setAnnounce(ESENCIAL_COPY.added);
    return { id: task.id, title: task.title };
  }

  return (
    <EsencialCard
      title={ESENCIAL_COPY.weekTitle}
      index={0}
      meta={<span className="text-[13px] text-muted-foreground">{`${total} ${plural(total, "tarea", "tareas")}`}</span>}
    >
      {todayItems.length === 0 && week.length === 0 ? <EmptyText>{ESENCIAL_COPY.weekEmpty}</EmptyText> : null}
      {todayItems.length > 0 ? (
        <AgendaGroup label={ESENCIAL_COPY.today}>{todayItems.map((item) => agendaRow(item, agendaTime(item), isNew(item)))}</AgendaGroup>
      ) : null}
      {week.length > 0 ? (
        <AgendaGroup label={ESENCIAL_COPY.week}>{shownWeek.map((item) => agendaRow(item, agendaWeekday(item), isNew(item)))}</AgendaGroup>
      ) : null}
      {hidden > 0 ? (
        <Button type="button" variant="link" size="sm" className="self-start" onClick={() => setExpanded(true)}>
          {`Ver ${hidden} más`}
        </Button>
      ) : null}
      <QuickAddRow
        variant="row"
        context={{
          label: ESENCIAL_COPY.quickAddLabel,
          placeholder: ESENCIAL_COPY.quickAddPlaceholder,
          projectId: null,
          assigneeId: meId,
        }}
        onCreate={onCreate}
      />
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </EsencialCard>
  );
}

function AttentionCard({ items }: { items: AttentionItem[] }) {
  const overdue = overdueAttention(items);
  const pill =
    overdue > 0 ? <Badge variant="destructive">{`${overdue} ${plural(overdue, "vencida", "vencidas")}`}</Badge> : null;
  return (
    <EsencialCard title={ESENCIAL_COPY.attentionTitle} index={1} meta={pill}>
      {items.length === 0 ? (
        <EmptyText>{ESENCIAL_COPY.attentionEmpty}</EmptyText>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.slice(0, ATTENTION_VISIBLE).map((item) => (
            <li key={item.id} title={item.title}>
              <EsencialItemRow title={item.title} href={item.href} layout="stacked" meta={attentionMeta(item)} status={null} />
            </li>
          ))}
        </ul>
      )}
      {overdue > 0 ? (
        <MoreLink href={ATTENTION_OVERDUE_HREF}>{`Ver ${plural(overdue, "la", "las")} ${overdue} →`}</MoreLink>
      ) : null}
    </EsencialCard>
  );
}

const PACE_SERIES: LineSeries[] = [
  { key: "completed", label: "Completadas", colorVar: "var(--chart-1)" },
  { key: "created", label: "Creadas", colorVar: "var(--chart-4)", dashed: true },
];

function PaceCard({ weeks, scope }: { weeks: InicioData["weeklyPace"]; scope: InicioData["paceScope"] }) {
  const pace = paceSummary(weeks);
  const pill = pace ? pacePill(pace.net) : null;
  const points = weeks.slice(-PACE_WEEKS).map((w) => ({
    key: w.weekStart,
    label: w.weekStart,
    values: { completed: w.completed, created: w.created },
  }));
  return (
    <EsencialCard
      title={ESENCIAL_COPY.paceTitle}
      index={2}
      meta={pill ? <Badge variant={pill.tone}>{pill.label}</Badge> : null}
    >
      {pace ? (
        <>
          <p className="text-[13.5px] text-foreground">{paceSentence(pace, scope)}</p>
          <div aria-hidden="true">
            <LineSeriesWidget
              title={ESENCIAL_COPY.paceTitle}
              points={points}
              series={PACE_SERIES}
              table={{ columns: [], rows: [] }}
              compact={{ height: 72 }}
            />
          </div>
          <ul aria-hidden="true" className="flex flex-wrap gap-4 text-[12.5px] text-muted-foreground">
            {PACE_SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span
                  className={s.dashed ? "h-0 w-3.5 border-t-2 border-dashed" : "h-0.5 w-3.5"}
                  style={s.dashed ? { borderColor: s.colorVar } : { backgroundColor: s.colorVar }}
                />
                {s.label}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyText>{ESENCIAL_COPY.paceEmpty}</EmptyText>
      )}
    </EsencialCard>
  );
}

function ProjectsCard({ items }: { items: ProgressItem[] }) {
  const rows = projectsByProgress(items);
  return (
    <EsencialCard
      title={ESENCIAL_COPY.projectsTitle}
      index={3}
      action={<MoreLink href="/proyectos">{ESENCIAL_COPY.projectsMore}</MoreLink>}
    >
      {rows.length === 0 ? (
        <EmptyText>{ESENCIAL_COPY.projectsEmpty}</EmptyText>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {rows.map((item) => {
            const real = Math.max(0, Math.min(100, Math.round(item.real)));
            const color = item.colorVar ?? "var(--primary)";
            return (
              <li key={item.id} className="flex flex-col gap-1.5">
                <div className="flex min-w-0 items-baseline justify-between gap-3">
                  {item.href ? (
                    <Link href={item.href} title={item.label} className="min-w-0 truncate text-sm font-medium text-foreground hover:underline">
                      {item.label}
                    </Link>
                  ) : (
                    <span title={item.label} className="min-w-0 truncate text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                  )}
                  <span
                    data-slot="project-etapa"
                    className={item.atRisk ? "shrink-0 text-[12.5px] text-destructive" : "shrink-0 text-[12.5px] text-muted-foreground"}
                  >
                    {item.atRisk
                      ? [ESENCIAL_COPY.atRisk, item.sublabel].filter(Boolean).join(" · ")
                      : (item.sublabel ?? "")}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={real}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${item.label}: ${real} %`}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full rounded-full" style={{ width: `${real}%`, backgroundColor: color }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </EsencialCard>
  );
}

/** Four 260 px card skeletons, each with three 36 px rows. */
export function InicioEsencialSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando" className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-5">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} data-slot="esencial-card-skeleton" className="flex h-[260px] flex-col gap-3.5 rounded-[14px] border border-border bg-card px-6 py-5.5">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 3 }, (_, j) => (
            <Skeleton key={j} className="h-9 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function InicioEsencial({ data, firstName, now, meId, loading = false }: InicioEsencialProps) {
  return (
    <StyleContent className="flex flex-col gap-5">
      <PageHeader
        title={`${greetingFor(now, TZ)}, ${firstName}`}
        description={esencialDateLine(now, data.myAttention)}
        actions={
          <Link href="/tareas?nueva=1" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nueva tarea
          </Link>
        }
      />
      {loading ? (
        <InicioEsencialSkeleton />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-5">
          <WeekCard data={data} now={now} meId={meId} />
          <AttentionCard items={data.attention} />
          <PaceCard weeks={data.weeklyPace} scope={data.paceScope} />
          <ProjectsCard items={data.projectsProgress} />
        </div>
      )}
    </StyleContent>
  );
}
