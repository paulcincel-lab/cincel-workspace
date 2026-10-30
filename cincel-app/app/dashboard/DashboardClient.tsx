"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  BanIcon,
  CalendarClockIcon,
  CalendarX2Icon,
  FolderKanbanIcon,
  ListChecksIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/shadcn/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";

import { PageHeader } from "@/components/v2/layout/PageHeader";
import { AreaBadge } from "@/components/v2/status/AreaBadge";
import {
  useProjectsData,
  type ProjectItem,
} from "@/lib/proyectos/use-projects-data";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import {
  resolveDashboardCapabilities,
  scopeDashboardProjects,
  scopeDashboardTasks,
} from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import type { TaskListItem } from "@/lib/types/core";
import { isDueDateLate } from "@/lib/tasks/status-options";
import {
  projectsByArea,
  tasksByBaseStatus,
} from "@/lib/dashboard/donut-groups";
import { DonutCard } from "./DonutCard";
import { TaskTrendCard } from "./TaskTrendCard";

interface DashboardClientProps {
  initialProjects: ProjectItem[];
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Small mono uppercase label used for the widget table headers. */
const SECTION_LABEL =
  "font-mono text-[11px] font-normal tracking-wider uppercase";

const SHORT_DATE = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
});

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShortDate(value: string | null): string {
  const date = toDate(value);
  return date ? SHORT_DATE.format(date).replace(".", "") : "Sin fecha";
}

function effectiveDueDate(task: TaskListItem): string | null {
  return task.deliveryDate || task.commitmentDate;
}

type Reason = "overdue" | "blocked" | "noOwner";

const REASONS: Record<
  Reason,
  { label: string; variant: "destructive" | "secondary" }
> = {
  overdue: { label: "Vencida", variant: "destructive" },
  blocked: { label: "Bloqueada", variant: "destructive" },
  noOwner: { label: "Sin responsable", variant: "secondary" },
};

interface TaskRow {
  task: TaskListItem;
  reasons: Reason[];
}

interface TaskTableProps {
  rows: TaskRow[];
  todayIso: string;
  dateOf: (task: TaskListItem) => string | null;
  showReasons?: boolean;
}

function TaskTable({ rows, todayIso, dateOf, showReasons }: TaskTableProps) {
  return (
    <Table className={showReasons ? "min-w-[640px]" : "min-w-[520px]"}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(SECTION_LABEL, "pl-4")}>Tarea</TableHead>
          <TableHead className={SECTION_LABEL}>Área</TableHead>
          {showReasons ? (
            <TableHead className={SECTION_LABEL}>Motivo</TableHead>
          ) : null}
          <TableHead className={SECTION_LABEL}>Responsable</TableHead>
          <TableHead className={cn(SECTION_LABEL, "pr-4 text-right")}>
            Fecha
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ task: t, reasons }) => {
          const date = dateOf(t);
          return (
            <TableRow key={t.id}>
              <TableCell className="pl-4">
                <div className="flex flex-col">
                  <Link
                    href={`/proyectos/${t.projectId}/ficha`}
                    className="font-medium hover:underline"
                  >
                    {t.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {t.project.name}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {t.workflow ? (
                  <AreaBadge
                    name={t.workflow.name}
                    colorSlot={t.areaColorSlot}
                  />
                ) : (
                  <span className="text-muted-foreground">Sin área</span>
                )}
              </TableCell>
              {showReasons ? (
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {reasons.map((reason) => (
                      <Badge key={reason} variant={REASONS[reason].variant}>
                        {REASONS[reason].label}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              ) : null}
              <TableCell>
                {t.manager ? (
                  t.manager.name
                ) : (
                  <span className="text-muted-foreground">Sin responsable</span>
                )}
              </TableCell>
              <TableCell
                className={cn(
                  "pr-4 text-right font-mono text-xs",
                  showReasons && isDueDateLate(date, todayIso, t)
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {formatShortDate(date)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function DashboardClient({ initialProjects }: DashboardClientProps) {
  const { projectsData, isLoadingData } = useProjectsData(initialProjects);
  const [allTasks, setAllTasks] = useState<TaskListItem[]>([]);
  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());

  useEffect(() => {
    void fetchTasksAction({ archived: false })
      .then(setAllTasks)
      .catch(() => undefined);
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Same role-based data scope (global / managed_projects / assigned_tasks) as
  // the legacy dashboard — a non-privileged viewer must not see projects or
  // tasks outside their scope just because this is the "new" page.
  const dashboardCapabilities = useMemo(
    () => resolveDashboardCapabilities(authenticatedUser),
    [authenticatedUser],
  );

  const viewerId = authenticatedUser?.member.id ?? "";

  const scopedProjectsData = useMemo(
    () =>
      scopeDashboardProjects({
        projects: projectsData,
        tasks: allTasks,
        viewerId,
        dataScope: dashboardCapabilities.dataScope,
      }),
    [allTasks, viewerId, dashboardCapabilities.dataScope, projectsData],
  );

  const scopedAllTasks = useMemo(
    () =>
      scopeDashboardTasks({
        tasks: allTasks,
        viewerId,
        dataScope: dashboardCapabilities.dataScope,
        allowedProjectIds: new Set(
          scopedProjectsData.map((project) => project.id),
        ),
      }),
    [allTasks, viewerId, dashboardCapabilities.dataScope, scopedProjectsData],
  );

  const activeTasks = useMemo(
    () => scopedAllTasks.filter((t) => !t.archived),
    [scopedAllTasks],
  );

  const kpis = useMemo(() => {
    const activeProjects = scopedProjectsData.filter(
      (p) => p.status === "activo",
    ).length;

    const overdue = activeTasks.filter((t) => {
      const due = toDate(effectiveDueDate(t));
      return !!due && due < today && t.status !== "completado";
    });

    const blocked = activeTasks.filter((t) => t.status === "bloqueado");

    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const reviews = activeTasks.filter((t) => {
      const review = toDate(t.reviewDate);
      return !!review && review >= today && review <= weekEnd;
    });

    const noOwner = activeTasks.filter((t) => !t.manager);

    return { activeProjects, overdue, blocked, reviews, noOwner };
  }, [scopedProjectsData, activeTasks, today]);

  const tasksByStatus = useMemo(
    () => tasksByBaseStatus(activeTasks),
    [activeTasks],
  );

  const projectsByDepartment = useMemo(
    () =>
      projectsByArea(scopedProjectsData.filter((p) => p.status === "activo")),
    [scopedProjectsData],
  );

  // One row per task, carrying every reason it needs attention.
  const attention = useMemo(() => {
    const byId = new Map<string, TaskRow>();
    const add = (list: TaskListItem[], reason: Reason) =>
      list.forEach((task) => {
        const entry = byId.get(task.id);
        if (entry) entry.reasons.push(reason);
        else byId.set(task.id, { task, reasons: [reason] });
      });
    add(kpis.overdue, "overdue");
    add(kpis.blocked, "blocked");
    add(kpis.noOwner, "noOwner");
    return [...byId.values()].slice(0, 5);
  }, [kpis]);

  const upcomingReviews = useMemo(
    () =>
      [...kpis.reviews]
        .sort((a, b) => (a.reviewDate ?? "").localeCompare(b.reviewDate ?? ""))
        .map((task) => ({ task, reasons: [] })),
    [kpis.reviews],
  );

  const todayIso = toIsoDate(today);

  const kpiTiles = [
    {
      label: "Proyectos activos",
      value: kpis.activeProjects,
      icon: FolderKanbanIcon,
      alert: false,
    },
    {
      label: "Vencidas",
      value: kpis.overdue.length,
      icon: CalendarX2Icon,
      alert: kpis.overdue.length > 0,
    },
    {
      label: "Bloqueadas",
      value: kpis.blocked.length,
      icon: BanIcon,
      alert: kpis.blocked.length > 0,
    },
    {
      label: "Revisiones 7 días",
      value: kpis.reviews.length,
      icon: CalendarClockIcon,
      alert: false,
    },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Dashboard ejecutivo"
        description="Vista unificada de riesgo, agenda y carga operativa."
      />

      <div className="mb-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {kpiTiles.map(({ label, value, icon: Icon, alert }) => (
          <Card key={label} className="min-w-0">
            <CardContent className="flex flex-col gap-2">
              <span
                aria-hidden
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg",
                  alert
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="text-2xl font-semibold tabular-nums">
                {value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2.5 font-semibold">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
              >
                <AlertTriangleIcon className="size-4" />
              </span>
              Requiere atención
            </CardTitle>
            <CardAction>
              <Link
                href="/actividades/general"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Ver todas →
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {attention.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">
                Todo al día — nada requiere atención inmediata.
              </p>
            ) : (
              <TaskTable
                rows={attention}
                todayIso={todayIso}
                dateOf={effectiveDueDate}
                showReasons
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2.5 font-semibold">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              >
                <CalendarClockIcon className="size-4" />
              </span>
              Revisiones próximas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {upcomingReviews.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">
                Sin revisiones en los próximos 7 días.
              </p>
            ) : (
              <TaskTable
                rows={upcomingReviews}
                todayIso={todayIso}
                dateOf={(t) => t.reviewDate}
              />
            )}
          </CardContent>
        </Card>

        <TaskTrendCard />

        <DonutCard
          title="Tareas por estatus"
          icon={
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1"
            >
              <ListChecksIcon className="size-4" />
            </span>
          }
          slices={tasksByStatus}
          unit="tareas"
          emptyText="Sin tareas activas."
        />

        <DonutCard
          title="Proyectos por departamento"
          icon={
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-lg bg-chart-3/10 text-chart-3"
            >
              <FolderKanbanIcon className="size-4" />
            </span>
          }
          slices={projectsByDepartment}
          unit="proyectos"
          emptyText="Sin proyectos activos."
        />
      </div>

      {isLoadingData ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Actualizando datos…
        </p>
      ) : null}
    </div>
  );
}
