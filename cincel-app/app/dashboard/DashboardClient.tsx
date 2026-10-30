"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangleIcon, CalendarCheckIcon, ListChecksIcon } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";

import { PageHeader } from "@/components/v2/layout/PageHeader";
import { KpiRow } from "@/components/v2/layout/KpiRow";
import { AreaBadge } from "@/components/v2/status/AreaBadge";
import { LoadBar } from "@/components/v2/status/LoadBar";
import { useProjectsData, type ProjectItem } from "@/lib/proyectos/use-projects-data";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveDashboardCapabilities, scopeDashboardProjects, scopeDashboardTasks } from "@/lib/auth/permissions";
import { StatusBadge, StatusDot } from "@/components/v2/status/StatusBadge";
import { cn } from "@/lib/utils";
import type { TaskListItem } from "@/lib/types/core";
import {
  BASE_STATUSES,
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
  isDueDateLate,
  statusColorToken,
  statusSelectValue,
  taskStatusLabel,
  type StatusColorToken,
} from "@/lib/tasks/status-options";

interface DashboardClientProps {
  initialProjects: ProjectItem[];
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Small mono uppercase label used for the widget table headers. */
const SECTION_LABEL = "font-mono text-[11px] font-normal tracking-wider uppercase";

const SHORT_DATE = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

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
    void fetchTasksAction({ archived: false }).then(setAllTasks).catch(() => undefined);
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
    [authenticatedUser]
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
    [allTasks, viewerId, dashboardCapabilities.dataScope, projectsData]
  );

  const scopedAllTasks = useMemo(
    () =>
      scopeDashboardTasks({
        tasks: allTasks,
        viewerId,
        dataScope: dashboardCapabilities.dataScope,
        allowedProjectIds: new Set(scopedProjectsData.map((project) => project.id)),
      }),
    [allTasks, viewerId, dashboardCapabilities.dataScope, scopedProjectsData]
  );

  const activeTasks = useMemo(() => scopedAllTasks.filter((t) => !t.archived), [scopedAllTasks]);

  const kpis = useMemo(() => {
    const activeProjects = scopedProjectsData.filter((p) => p.status === "activo").length;

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

  // Built-in statuses always listed; custom statuses are their own rows, when in use.
  const statusMix = useMemo(() => {
    const total = activeTasks.length || 1;
    const rows = new Map<string, { status: string; label: string; token: StatusColorToken; count: number }>(
      BASE_STATUSES.map((status) => [
        status,
        { status, label: BASE_STATUS_LABEL[status], token: BASE_STATUS_COLOR[status], count: 0 },
      ])
    );
    activeTasks.forEach((t) => {
      const key = statusSelectValue(t);
      const row = rows.get(key) ?? { status: key, label: taskStatusLabel(t), token: statusColorToken(t), count: 0 };
      row.count += 1;
      rows.set(key, row);
    });
    return [...rows.values()].map((row) => ({ ...row, percent: (row.count / total) * 100 }));
  }, [activeTasks]);

  const weeklyProgress = useMemo(() => {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const dueThisWeek = activeTasks.filter((t) => {
      const due = toDate(effectiveDueDate(t));
      return !!due && due >= weekStart && due <= today;
    });
    const completed = dueThisWeek.filter((t) => t.status === "completado");
    return { completed: completed.length, total: dueThisWeek.length };
  }, [activeTasks, today]);

  const attention = [...kpis.overdue, ...kpis.blocked, ...kpis.noOwner].slice(0, 5);

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
          { label: "Vencidas", value: kpis.overdue.length, tone: kpis.overdue.length > 0 ? "warn" : "default" },
          { label: "Bloqueadas", value: kpis.blocked.length, tone: kpis.blocked.length > 0 ? "warn" : "default" },
          { label: "Revisiones (7 días)", value: kpis.reviews.length },
        ]}
      />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2.5 font-semibold">
              <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangleIcon className="size-4" />
              </span>
              Necesita atención hoy
            </CardTitle>
            <CardAction>
              <Link href="/actividades/general" className="text-sm text-muted-foreground hover:text-foreground">
                Ver todas →
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {attention.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">Todo al día — nada requiere atención inmediata.</p>
            ) : (
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={cn(SECTION_LABEL, "pl-4")}>Tarea</TableHead>
                    <TableHead className={SECTION_LABEL}>Área</TableHead>
                    <TableHead className={SECTION_LABEL}>Estatus</TableHead>
                    <TableHead className={SECTION_LABEL}>Responsable</TableHead>
                    <TableHead className={cn(SECTION_LABEL, "pr-4 text-right")}>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attention.map((t) => {
                    const due = effectiveDueDate(t);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="pl-4">
                          <div className="flex flex-col">
                            <Link href={`/proyectos/${t.projectId}/ficha`} className="font-medium hover:underline">
                              {t.title}
                            </Link>
                            <span className="text-xs text-muted-foreground">{t.project.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.workflow ? (
                            <AreaBadge name={t.workflow.name} colorSlot={t.areaColorSlot} />
                          ) : (
                            <span className="text-muted-foreground">Sin área</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge label={taskStatusLabel(t)} token={statusColorToken(t)} />
                        </TableCell>
                        <TableCell>
                          {t.manager ? t.manager.name : <span className="text-muted-foreground">Sin responsable</span>}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "pr-4 text-right font-mono text-xs",
                            isDueDateLate(due, todayIso, t) ? "text-destructive" : "text-muted-foreground"
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

        <Card className="min-w-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2.5 font-semibold">
              <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1">
                <ListChecksIcon className="size-4" />
              </span>
              Estatus de actividades
            </CardTitle>
            <CardAction>
              <span className="font-mono text-xs text-muted-foreground">{activeTasks.length} tareas</span>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(SECTION_LABEL, "pl-4")}>Estatus</TableHead>
                  <TableHead className={cn(SECTION_LABEL, "text-right")}>Tareas</TableHead>
                  <TableHead className={cn(SECTION_LABEL, "pr-4 text-right")}>%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusMix.map((s) => (
                  <TableRow key={s.status}>
                    <TableCell className="pl-4">
                      <span className="flex items-center gap-2">
                        <StatusDot token={s.token} />
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{s.count}</TableCell>
                    <TableCell className="pr-4 text-right font-mono tabular-nums text-muted-foreground">
                      {Math.round(s.percent)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2.5 font-semibold">
              <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2">
                <CalendarCheckIcon className="size-4" />
              </span>
              Avance semanal
            </CardTitle>
            <CardAction>
              <span className="font-mono text-xs text-muted-foreground">
                {weeklyProgress.completed} / {weeklyProgress.total}
              </span>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p>
              {weeklyProgress.completed} / {weeklyProgress.total} tareas completadas esta semana
            </p>
            <LoadBar
              segments={[{ percent: weeklyProgress.total ? (weeklyProgress.completed / weeklyProgress.total) * 100 : 0 }]}
            />
          </CardContent>
        </Card>
      </div>

      {isLoadingData ? (
        <p className="mt-3 text-xs text-muted-foreground">Actualizando datos…</p>
      ) : null}
    </div>
  );
}
