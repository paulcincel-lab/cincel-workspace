"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/v2/layout/PageHeader";
import { KpiRow } from "@/components/v2/layout/KpiRow";
import { LoadBar } from "@/components/v2/status/LoadBar";
import { useProjectsData, type ProjectItem } from "@/lib/proyectos/use-projects-data";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveDashboardCapabilities, scopeDashboardProjects, scopeDashboardTasks } from "@/lib/auth/permissions";
import type { Task, TaskStatus } from "@/lib/types/task";

interface DashboardClientProps {
  initialProjects: ProjectItem[];
}

function toDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function effectiveDueDate(task: Task): string {
  return task.deliveryDate || task.commitmentDate || "";
}

const STATUS_ORDER: TaskStatus[] = ["Pendiente", "En proceso", "Completado", "Bloqueado"];

export function DashboardClient({ initialProjects }: DashboardClientProps) {
  const { projectsData, allTasks, isLoadingData, secondaryCoordinatorByProject } = useProjectsData(initialProjects);
  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());

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

  const scopedProjectsData = useMemo(
    () =>
      scopeDashboardProjects({
        projects: projectsData,
        tasks: allTasks,
        viewerName: authenticatedUser?.member.name || "",
        dataScope: dashboardCapabilities.dataScope,
        secondaryCoordinatorByProject,
      }),
    [allTasks, authenticatedUser, dashboardCapabilities.dataScope, projectsData, secondaryCoordinatorByProject]
  );

  const scopedAllTasks = useMemo(
    () =>
      scopeDashboardTasks({
        tasks: allTasks,
        viewerName: authenticatedUser?.member.name || "",
        dataScope: dashboardCapabilities.dataScope,
        allowedProjectNames: new Set(scopedProjectsData.map((project) => project.name)),
      }),
    [allTasks, authenticatedUser, dashboardCapabilities.dataScope, scopedProjectsData]
  );

  const activeTasks = useMemo(() => scopedAllTasks.filter((t) => !t.archived), [scopedAllTasks]);

  const kpis = useMemo(() => {
    const activeProjects = scopedProjectsData.filter((p) => p.active).length;

    const overdue = activeTasks.filter((t) => {
      const due = toDate(effectiveDueDate(t));
      return !!due && due < today && t.status !== "Completado";
    });

    const blocked = activeTasks.filter((t) => t.status === "Bloqueado");

    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const reviews = activeTasks.filter((t) => {
      const review = toDate(t.reviewDate);
      return !!review && review >= today && review <= weekEnd;
    });

    const noOwner = activeTasks.filter((t) => !t.manager || t.manager === "Sin responsable");

    return { activeProjects, overdue, blocked, reviews, noOwner };
  }, [scopedProjectsData, activeTasks, today]);

  const statusMix = useMemo(() => {
    const total = activeTasks.length || 1;
    return STATUS_ORDER.map((status) => ({
      status,
      count: activeTasks.filter((t) => t.status === status).length,
      percent: (activeTasks.filter((t) => t.status === status).length / total) * 100,
    }));
  }, [activeTasks]);

  const weeklyProgress = useMemo(() => {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const dueThisWeek = activeTasks.filter((t) => {
      const due = toDate(effectiveDueDate(t));
      return !!due && due >= weekStart && due <= today;
    });
    const completed = dueThisWeek.filter((t) => t.status === "Completado");
    return { completed: completed.length, total: dueThisWeek.length };
  }, [activeTasks, today]);

  const attention = [...kpis.overdue, ...kpis.blocked, ...kpis.noOwner].slice(0, 5);

  return (
    <div>
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

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 text-sm font-semibold">
            Necesita atención hoy
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              {attention.length}
            </span>
          </div>
          <div className="p-3.5">
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todo al día — nada requiere atención inmediata.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {attention.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-[12.5px]">
                    <span className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-destructive" />
                      {t.project} — {t.description}
                    </span>
                    <Link href="/tareas" className="font-mono text-[10px] text-muted-foreground hover:text-foreground">
                      ver
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 text-sm font-semibold">
            Estatus de actividades
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              {activeTasks.length} tareas
            </span>
          </div>
          <div className="flex flex-col gap-2.5 p-3.5">
            {statusMix.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-[12.5px]">
                <span className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-foreground" />
                  {s.status}
                </span>
                <span className="tabular-nums text-muted-foreground">{Math.round(s.percent)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3.5 rounded-lg border border-border bg-card p-3.5">
        <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
          <span>
            {weeklyProgress.completed} / {weeklyProgress.total || 0} tareas completadas esta semana
          </span>
        </div>
        <LoadBar segments={[{ percent: weeklyProgress.total ? (weeklyProgress.completed / weeklyProgress.total) * 100 : 0 }]} />
      </div>

      {isLoadingData ? (
        <p className="mt-3 text-xs text-muted-foreground">Actualizando datos…</p>
      ) : null}
    </div>
  );
}
