"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  FolderKanbanIcon,
  ListChecksIcon,
} from "lucide-react";

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
import { KpiRow } from "@/components/v2/layout/KpiRow";
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
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import { cn } from "@/lib/utils";
import type { TaskListItem } from "@/lib/types/core";
import {
  isDueDateLate,
  statusColorToken,
  taskStatusLabel,
} from "@/lib/tasks/status-options";
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

  const attention = [...kpis.overdue, ...kpis.blocked, ...kpis.noOwner].slice(
    0,
    5,
  );

  const todayIso = toIsoDate(today);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Dashboard ejecutivo"
        description="Vista unificada de riesgo, agenda y carga operativa."
      />

      <KpiRow
        tiles={[
          { label: "Proyectos activos", value: kpis.activeProjects },
          {
            label: "Vencidas",
            value: kpis.overdue.length,
            tone: kpis.overdue.length > 0 ? "warn" : "default",
          },
          {
            label: "Bloqueadas",
            value: kpis.blocked.length,
            tone: kpis.blocked.length > 0 ? "warn" : "default",
          },
          { label: "Revisiones (7 días)", value: kpis.reviews.length },
        ]}
      />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2.5 font-semibold">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
              >
                <AlertTriangleIcon className="size-4" />
              </span>
              Necesita atención hoy
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
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={cn(SECTION_LABEL, "pl-4")}>
                      Tarea
                    </TableHead>
                    <TableHead className={SECTION_LABEL}>Área</TableHead>
                    <TableHead className={SECTION_LABEL}>Estatus</TableHead>
                    <TableHead className={SECTION_LABEL}>Responsable</TableHead>
                    <TableHead className={cn(SECTION_LABEL, "pr-4 text-right")}>
                      Fecha
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attention.map((t) => {
                    const due = effectiveDueDate(t);
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
                            <span className="text-muted-foreground">
                              Sin área
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={taskStatusLabel(t)}
                            token={statusColorToken(t)}
                          />
                        </TableCell>
                        <TableCell>
                          {t.manager ? (
                            t.manager.name
                          ) : (
                            <span className="text-muted-foreground">
                              Sin responsable
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "pr-4 text-right font-mono text-xs",
                            isDueDateLate(due, todayIso, t)
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatShortDate(due)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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

        <TaskTrendCard />
      </div>

      {isLoadingData ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Actualizando datos…
        </p>
      ) : null}
    </div>
  );
}
