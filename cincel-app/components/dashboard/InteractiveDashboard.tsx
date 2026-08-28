"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import UnifiedCalendar from "@/components/calendario/UnifiedCalendar";
import { buildCalendarEvents } from "@/lib/calendar/calendar-service";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveCalendarCapabilities, resolveDashboardCapabilities, scopeDashboardProjects, scopeDashboardTasks } from "@/lib/auth/permissions";
import { projects as baseProjects } from "@/lib/data/projects";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { presaleTasks } from "@/lib/data/presale";
import type { Task, TaskStatus, WorkflowType } from "@/lib/types/task";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { readStorage } from "@/lib/repositories/browser-state-repository";
import { fetchProjects } from "@/lib/repositories/projects-repository";
import { fetchActivities } from "@/lib/repositories/activities-repository";
import { RepositoryError } from "@/lib/errors";

const PROJECTS_STORAGE_KEY = "cincel.projects.data.v1";
const SECONDARY_COORDINATOR_STORAGE_KEY = "cincel.projects.secondary-coordinator.v1";

type ProjectData = (typeof baseProjects)[number];

type DashboardTasksState = {
  presale: Task[];
  diseno: Task[];
  operativas: Task[];
};

type DateRangeFilter = "7d" | "30d" | "90d";

function loadPersistedProjects(): ProjectData[] {
  if (typeof window === "undefined") {
    return baseProjects;
  }

  const stored = readStorage(PROJECTS_STORAGE_KEY);

  if (!stored) {
    return baseProjects;
  }

  try {
    const parsed = JSON.parse(stored) as ProjectData[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : baseProjects;
  } catch {
    return baseProjects;
  }
}

function loadSecondaryCoordinatorMap(): Record<number, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = readStorage(SECONDARY_COORDINATOR_STORAGE_KEY);

  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<number, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function isDateInRange(value: string, from: Date, to: Date): boolean {
  const current = toDate(value);
  if (!current) {
    return false;
  }

  return current >= from && current <= to;
}

function getTaskEffectiveDueDate(task: Task): string {
  return task.deliveryDate || task.commitmentDate || "";
}

function hasTaskDateInRange(task: Task, from: Date, to: Date): boolean {
  return (
    isDateInRange(task.commitmentDate, from, to) ||
    isDateInRange(task.reviewDate, from, to) ||
    isDateInRange(task.deliveryDate || "", from, to)
  );
}

function formatStageLabel(workflow: WorkflowType): string {
  if (workflow === "Diseño") {
    return "Taller de Diseño";
  }

  return workflow;
}

function riskTone(score: number): string {
  if (score >= 60) {
    return "bg-red-100 text-red-800";
  }

  if (score >= 35) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-emerald-100 text-emerald-800";
}

function getMexicoCityToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Mexico_City",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(`${year}-${month}-${day}T00:00:00`);
}

export default function InteractiveDashboard() {
  const [projectsData, setProjectsData] = useState<ProjectData[]>(() => loadPersistedProjects());
  const [secondaryCoordinatorByProject, setSecondaryCoordinatorByProject] = useState<Record<number, string>>(() => loadSecondaryCoordinatorMap());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [tasksData, setTasksData] = useState<DashboardTasksState>(() => ({
    presale: loadLinkedTasks("Presale", presaleTasks),
    diseno: loadLinkedTasks("Diseño", disenoTasks),
    operativas: loadLinkedTasks("Construcción", operativasTasks),
  }));

  const [rangeFilter, setRangeFilter] = useState<DateRangeFilter>("30d");
  const [stageFilter, setStageFilter] = useState<"Todas" | WorkflowType>("Todas");
  const [projectFilter, setProjectFilter] = useState("Todos");
  const [managerFilter, setManagerFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState<"Todos" | TaskStatus>("Todos");
  const viewerName = authenticatedUser?.member.name?.trim() || "Usuario";
  const canViewAllProfiles = Boolean(authenticatedUser && (authenticatedUser.access === "Administrador" || authenticatedUser.access === "Dirección"));
  const managerScope = canViewAllProfiles ? managerFilter : viewerName;

  const resetFilters = () => {
    setRangeFilter("30d");
    setStageFilter("Todas");
    setProjectFilter("Todos");
    setManagerFilter("Todos");
    setStatusFilter("Todos");
  };

  const today = useMemo(() => getMexicoCityToday(), []);
  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  useEffect(() => {
    const refreshAll = () => {
      setProjectsData(loadPersistedProjects());
      setSecondaryCoordinatorByProject(loadSecondaryCoordinatorMap());
      setAuthenticatedUser(getCurrentAuthenticatedUser());
      setTasksData({
        presale: loadLinkedTasks("Presale", presaleTasks),
        diseno: loadLinkedTasks("Diseño", disenoTasks),
        operativas: loadLinkedTasks("Construcción", operativasTasks),
      });
    };

    // Ensure Dashboard starts with the latest local changes immediately.
    refreshAll();

    // Pull live data from Postgres, then re-read (fetch* mirrors into the
    // localStorage keys the dashboard reads synchronously).
    const hydrateFromDb = async () => {
      try {
        await Promise.all([
          fetchProjects(),
          fetchActivities("Presale"),
          fetchActivities("Diseño"),
          fetchActivities("Construcción"),
        ]);
        refreshAll();
      } catch (err) {
        if (err instanceof RepositoryError) return;
      }
    };
    void hydrateFromDb();

    window.addEventListener("focus", refreshAll);
    window.addEventListener("storage", refreshAll);

    return () => {
      window.removeEventListener("focus", refreshAll);
      window.removeEventListener("storage", refreshAll);
    };
  }, []);

  const allTasks = [
    ...tasksData.presale,
    ...tasksData.diseno,
    ...tasksData.operativas,
  ].filter((task) => !task.archived);

  const dashboardCapabilities = useMemo(() => {
    return resolveDashboardCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  const calendarCapabilities = useMemo(() => {
    return resolveCalendarCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  const scopedProjectsData = useMemo(() => {
    return scopeDashboardProjects({
      projects: projectsData,
      tasks: allTasks,
      viewerName: authenticatedUser?.member.name || "",
      dataScope: dashboardCapabilities.dataScope,
      secondaryCoordinatorByProject,
    });
  }, [allTasks, authenticatedUser, dashboardCapabilities.dataScope, projectsData, secondaryCoordinatorByProject]);

  const scopedAllTasks = useMemo(() => {
    return scopeDashboardTasks({
      tasks: allTasks,
      viewerName: authenticatedUser?.member.name || "",
      dataScope: dashboardCapabilities.dataScope,
      allowedProjectNames: new Set(scopedProjectsData.map((project) => project.name)),
    });
  }, [allTasks, authenticatedUser, dashboardCapabilities.dataScope, scopedProjectsData]);

  const rangeEnd = useMemo(() => {
    const end = new Date(today);

    if (rangeFilter === "7d") {
      end.setDate(today.getDate() + 7);
      return end;
    }

    if (rangeFilter === "30d") {
      end.setDate(today.getDate() + 30);
      return end;
    }

    end.setDate(today.getDate() + 90);
    return end;
  }, [rangeFilter, today]);

  const projectOptions = useMemo(() => {
    const values = new Set(
      scopedProjectsData
        .filter((project) => project.active)
        .map((project) => project.name)
        .filter(Boolean)
    );

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [scopedProjectsData]);

  const managerOptions = useMemo(() => {
    if (!canViewAllProfiles) {
      return [viewerName];
    }

    const values = new Set(
      scopedAllTasks
        .map((task) => task.manager)
        .filter((manager) => manager && manager.trim().length > 0)
    );

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [canViewAllProfiles, scopedAllTasks, viewerName]);

  const filteredTasks = useMemo(() => {
    return scopedAllTasks.filter((task) => {
      const matchesStage = stageFilter === "Todas" || task.workflow === stageFilter;
      const matchesProject = projectFilter === "Todos" || task.project === projectFilter;
      const matchesManager = managerScope === "Todos" || task.manager === managerScope;
      const matchesStatus = statusFilter === "Todos" || task.status === statusFilter;

      const hasDateInRange = hasTaskDateInRange(task, today, rangeEnd);

      return matchesStage && matchesProject && matchesManager && matchesStatus && hasDateInRange;
    });
  }, [managerScope, projectFilter, rangeEnd, scopedAllTasks, stageFilter, statusFilter, today]);

  const kpis = useMemo(() => {
    const activeProjects = scopedProjectsData.filter((project) => project.active).length;

    const overdueTasks = filteredTasks.filter((task) => {
      const dueDate = toDate(getTaskEffectiveDueDate(task));
      return !!dueDate && dueDate < today && task.status !== "Completado";
    }).length;

    const blockedTasks = filteredTasks.filter((task) => task.status === "Bloqueado").length;

    const reviewsThisWeek = filteredTasks.filter((task) => {
      const review = toDate(task.reviewDate);
      if (!review) {
        return false;
      }

      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() + 7);
      return review >= today && review <= weekEnd;
    }).length;

    return {
      activeProjects,
      overdueTasks,
      blockedTasks,
      reviewsThisWeek,
    };
  }, [filteredTasks, scopedProjectsData, today]);

  const riskByProject = useMemo(() => {
    const activeProjects = scopedProjectsData.filter((project) => project.active);

    return activeProjects
      .map((project) => {
        const projectTasks = scopedAllTasks.filter((task) => task.project === project.name);

        if (projectTasks.length === 0) {
          return {
            name: project.name,
            manager: project.manager,
            stage: project.stage,
            progress: project.progress,
            overdue: 0,
            blocked: 0,
            unassigned: 0,
            score: 0,
          };
        }

        const overdue = projectTasks.filter((task) => {
          const dueDate = toDate(getTaskEffectiveDueDate(task));
          return !!dueDate && dueDate < today && task.status !== "Completado";
        }).length;

        const blocked = projectTasks.filter((task) => task.status === "Bloqueado").length;
        const unassigned = projectTasks.filter((task) => task.manager === "Sin responsable").length;

        const score = Math.round(
          (overdue / projectTasks.length) * 45 +
          (blocked / projectTasks.length) * 35 +
          (unassigned / projectTasks.length) * 20
        );

        return {
          name: project.name,
          manager: project.manager,
          stage: project.stage,
          progress: project.progress,
          overdue,
          blocked,
          unassigned,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [scopedAllTasks, scopedProjectsData, today]);

  const agenda = useMemo(() => {
    const nextItems = filteredTasks
      .flatMap((task) => {
        const entries: Array<{ type: "Compromiso" | "Revisión" | "Entrega"; date: string; task: Task }> = [];

        if (task.commitmentDate) {
          entries.push({ type: "Compromiso", date: task.commitmentDate, task });
        }

        if (task.reviewDate) {
          entries.push({ type: "Revisión", date: task.reviewDate, task });
        }

        if (task.deliveryDate) {
          entries.push({ type: "Entrega", date: task.deliveryDate, task });
        }

        return entries;
      })
      .filter((entry) => isDateInRange(entry.date, today, rangeEnd))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10);

    return nextItems;
  }, [filteredTasks, rangeEnd, today]);

  const workload = useMemo(() => {
    const rows = managerOptions.map((manager) => {
      const managerTasks = scopedAllTasks.filter((task) => task.manager === manager);
      const total = managerTasks.length;
      const inProgress = managerTasks.filter((task) => task.status === "En proceso").length;
      const blocked = managerTasks.filter((task) => task.status === "Bloqueado").length;
      const overdue = managerTasks.filter((task) => {
        const dueDate = toDate(getTaskEffectiveDueDate(task));
        return !!dueDate && dueDate < today && task.status !== "Completado";
      }).length;

      const saturation = Math.min(100, Math.round((inProgress * 20 + blocked * 25 + overdue * 25) / Math.max(total, 1)));

      return {
        manager,
        total,
        inProgress,
        blocked,
        overdue,
        saturation,
      };
    });

    return rows.sort((a, b) => b.saturation - a.saturation);
  }, [managerOptions, scopedAllTasks, today]);

  const flow = useMemo(() => {
    const stages: WorkflowType[] = ["Presale", "Diseño", "Construcción"];

    return stages.map((workflow) => {
      const count = filteredTasks.filter((task) => task.workflow === workflow).length;
      return {
        workflow,
        label: formatStageLabel(workflow),
        count,
      };
    });
  }, [filteredTasks]);

  const flowMax = useMemo(() => Math.max(...flow.map((entry) => entry.count), 1), [flow]);

  const alerts = useMemo(() => {
    const overdue = filteredTasks.filter((task) => {
      const dueDate = toDate(getTaskEffectiveDueDate(task));
      return !!dueDate && dueDate < today && task.status !== "Completado";
    });

    const blocked = filteredTasks.filter((task) => task.status === "Bloqueado");
    const noOwner = filteredTasks.filter((task) => task.manager === "Sin responsable");

    return [
      {
        id: "overdue",
        message: `${overdue.length} tareas vencidas requieren atencion inmediata`,
        href: "/tareas",
      },
      {
        id: "blocked",
        message: `${blocked.length} tareas bloqueadas frenan el flujo operativo`,
        href: "/tareas",
      },
      {
        id: "no-owner",
        message: `${noOwner.length} tareas sin responsable asignado`,
        href: "/tareas",
      },
    ];
  }, [filteredTasks, today]);

  const statusDistribution = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      Pendiente: 0,
      "En proceso": 0,
      Completado: 0,
      Bloqueado: 0,
    };

    filteredTasks.forEach((task) => {
      counts[task.status] += 1;
    });

    return [
      { status: "Pendiente", count: counts.Pendiente, tone: "bg-amber-500", color: "#f59e0b" },
      { status: "En proceso", count: counts["En proceso"], tone: "bg-orange-500", color: "#f97316" },
      { status: "Completado", count: counts.Completado, tone: "bg-cyan-500", color: "#06b6d4" },
      { status: "Bloqueado", count: counts.Bloqueado, tone: "bg-rose-500", color: "#ef4444" },
    ];
  }, [filteredTasks]);

  const statusTotal = useMemo(() => {
    return statusDistribution.reduce((acc, row) => acc + row.count, 0);
  }, [statusDistribution]);

  const statusProgress = useMemo(() => {
    const currentWeekStart = new Date(today);
    const currentWeekDay = (today.getDay() + 6) % 7;
    currentWeekStart.setDate(today.getDate() - currentWeekDay);

    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(currentWeekStart.getDate() - 7);

    const previousWeekEnd = new Date(currentWeekStart);
    previousWeekEnd.setDate(currentWeekStart.getDate() - 1);

    const matchesContextFilters = (task: Task) => {
      const matchesStage = stageFilter === "Todas" || task.workflow === stageFilter;
      const matchesProject = projectFilter === "Todos" || task.project === projectFilter;
      const matchesManager = managerScope === "Todos" || task.manager === managerScope;

      return matchesStage && matchesProject && matchesManager;
    };

    const currentWeekTasks = scopedAllTasks.filter((task) => {
      const hasDateInCurrentWeek = hasTaskDateInRange(task, currentWeekStart, currentWeekEnd);

      return matchesContextFilters(task) && hasDateInCurrentWeek;
    });

    const previousWeekTasks = scopedAllTasks.filter((task) => {
      const hasDateInPreviousWeek = hasTaskDateInRange(task, previousWeekStart, previousWeekEnd);

      return matchesContextFilters(task) && hasDateInPreviousWeek;
    });

    const completedCount = currentWeekTasks.filter((task) => task.status === "Completado").length;
    const completionRate = currentWeekTasks.length > 0 ? Math.round((completedCount / currentWeekTasks.length) * 100) : 0;

    const previousCompleted = previousWeekTasks.filter((task) => task.status === "Completado").length;
    const previousRate = previousWeekTasks.length > 0 ? Math.round((previousCompleted / previousWeekTasks.length) * 100) : 0;
    const deltaRate = completionRate - previousRate;

    return {
      completedCount,
      totalCount: currentWeekTasks.length,
      completionRate,
      deltaRate,
    };
  }, [managerScope, projectFilter, scopedAllTasks, stageFilter, today]);

  const projectAssignments = useMemo(() => {
    const tasksInContext = scopedAllTasks.filter((task) => {
      const matchesStage = stageFilter === "Todas" || task.workflow === stageFilter;
      const matchesProject = projectFilter === "Todos" || task.project === projectFilter;
      const matchesManager = managerScope === "Todos" || task.manager === managerScope;

      return matchesStage && matchesProject && matchesManager;
    });

    const activeProjectsInContext = scopedProjectsData
      .filter((project) => project.active)
      .filter((project) => projectFilter === "Todos" || project.name === projectFilter)
      .filter((project) => {
        if (stageFilter === "Todas") {
          return true;
        }

        const stageText = project.stage.toLowerCase();

        if (stageFilter === "Diseño") {
          return stageText.includes("dise") || stageText.includes("taller");
        }

        if (stageFilter === "Construcción") {
          return stageText.includes("constru");
        }

        return stageText.includes("presale");
      });

    return activeProjectsInContext.map((project) => {
      const projectTasks = tasksInContext.filter((task) => task.project === project.name);

      const responsables = Array.from(
        new Set(
          projectTasks
            .map((task) => task.manager)
            .filter((manager) => manager && manager !== "Sin responsable")
        )
      );

      const support = Array.from(
        new Set(
          projectTasks.flatMap((task) =>
            (task.support || []).filter((member) => member && member !== "Sin responsable")
          )
        )
      );

      return {
        id: project.id,
        project: project.name,
        projectLeader: project.manager || "Sin líder",
        constructionLeader: secondaryCoordinatorByProject[project.id] || "Sin líder",
        responsables: responsables.length > 0 ? responsables.join(", ") : "Sin responsable",
        support: support.length > 0 ? support.join(", ") : "Sin equipo",
      };
    });
  }, [managerScope, projectFilter, scopedAllTasks, scopedProjectsData, secondaryCoordinatorByProject, stageFilter]);

  const statusPieGradient = useMemo(() => {
    if (statusTotal === 0) {
      return "conic-gradient(#e2e8f0 0deg 360deg)";
    }

    let cursor = 0;
    const gapDeg = 2;

    const segments = statusDistribution.flatMap((row) => {
      if (row.count === 0) {
        return [];
      }

      const sweep = (row.count / statusTotal) * 360;
      const start = cursor;
      const colorEnd = start + Math.max(0, sweep - gapDeg);
      const gapEnd = start + sweep;
      cursor = gapEnd;

      return [
        `${row.color} ${start}deg ${colorEnd}deg`,
        `#f8fafc ${colorEnd}deg ${gapEnd}deg`,
      ];
    });

    return `conic-gradient(${segments.join(", ")})`;
  }, [statusDistribution, statusTotal]);

  const calendarEvents = useMemo(() => buildCalendarEvents(filteredTasks), [filteredTasks]);

  if (!isMounted) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-7 w-64 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-slate-100" />
        </section>
        <section className="grid gap-6 xl:grid-cols-3">
          <div className="h-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" />
          <div className="h-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" />
          <div className="h-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="whitespace-nowrap text-3xl font-bold text-slate-900">Dashboard Ejecutivo</h1>
            <p className="mt-2 text-slate-700">Vista unificada de riesgo, agenda y carga operativa.</p>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-3 lg:max-w-[1040px] xl:grid-cols-6">
            <select
              value={rangeFilter}
              onChange={(event) => setRangeFilter(event.target.value as DateRangeFilter)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900"
            >
              <option value="7d">Prox. 7 dias</option>
              <option value="30d">Prox. 30 dias</option>
              <option value="90d">Prox. 90 dias</option>
            </select>

            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value as "Todas" | WorkflowType)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900"
            >
              <option value="Todas">Todas etapas</option>
              <option value="Presale">Presale</option>
              <option value="Diseño">Taller de Diseño</option>
              <option value="Construcción">Construccion</option>
            </select>

            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900"
            >
              <option value="Todos">Todos proyectos</option>
              {projectOptions.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>

            <select
              value={canViewAllProfiles ? managerFilter : viewerName}
              onChange={(event) => setManagerFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900"
              disabled={!canViewAllProfiles}
            >
              {canViewAllProfiles ? <option value="Todos">Todos responsables</option> : null}
              {managerOptions.map((manager) => (
                <option key={manager} value={manager}>
                  {manager}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "Todos" | TaskStatus)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900"
            >
              <option value="Todos">Todos estatus</option>
              <option value="Pendiente">Pendiente</option>
              <option value="En proceso">En proceso</option>
              <option value="Completado">Completado</option>
              <option value="Bloqueado">Bloqueado</option>
            </select>

            <button
              type="button"
              onClick={resetFilters}
              className="h-11 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Restablecer
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-700">Proyectos activos</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{kpis.activeProjects}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-700">Tareas vencidas</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{kpis.overdueTasks}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-700">Tareas bloqueadas</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{kpis.blockedTasks}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-700">Revisiones (7 dias)</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{kpis.reviewsThisWeek}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-4">
        {dashboardCapabilities.sections.showProjectAssignments ? (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1">
            <h2 className="text-lg font-semibold text-slate-900">Asignacion por proyecto</h2>
            <p className="mt-1 text-sm text-slate-700">Lideres y colaboracion activa por proyecto.</p>

            {projectAssignments.length === 0 ? (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                No hay proyectos en el contexto de filtros actual.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[720px] bg-white">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Proyecto</th>
                      <th className="px-3 py-2">Lider de proyecto</th>
                      <th className="px-3 py-2">Lider de construccion</th>
                      <th className="px-3 py-2">Responsable</th>
                      <th className="px-3 py-2">Equipo de apoyo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectAssignments.map((row) => (
                      <tr key={`assign-${row.id}`} className="border-b border-slate-100 text-sm text-slate-800 last:border-b-0">
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.project}</td>
                        <td className="px-3 py-2">{row.projectLeader}</td>
                        <td className="px-3 py-2">{row.constructionLeader}</td>
                        <td className="px-3 py-2">{row.responsables}</td>
                        <td className="px-3 py-2">{row.support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        ) : null}

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1">
          <h2 className="text-lg font-semibold text-slate-900">Progreso semanal</h2>
          <p className="mt-3 text-3xl font-bold leading-none text-blue-600 md:text-4xl">
            {statusProgress.completedCount}
            <span className="ml-2 text-lg font-semibold text-slate-700 md:text-2xl">/ {statusProgress.totalCount} completadas</span>
          </p>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">Tareas realizadas esta semana</p>

          <div className="mt-3 h-3 rounded-full bg-blue-100">
            <div
              className="h-3 rounded-full bg-blue-600 transition-all"
              style={{ width: `${statusProgress.completionRate}%` }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className={`text-sm font-semibold md:text-base ${statusProgress.deltaRate >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {statusProgress.deltaRate >= 0 ? "+" : ""}
              {statusProgress.deltaRate}% vs semana anterior
            </span>
            <span className="text-xl font-bold text-slate-700 md:text-2xl">{statusProgress.completionRate}%</span>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Estatus de actividades</h2>
          <p className="mt-1 text-sm text-slate-700">Distribucion del backlog filtrado actual por estatus.</p>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(230px,280px)_1fr] md:items-center">
            <div className="relative mx-auto h-56 w-56 rounded-full bg-slate-100 p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)] md:h-64 md:w-64">
              <div
                className="h-full w-full rounded-full"
                style={{
                  background: statusPieGradient,
                  transform: "rotate(-90deg)",
                }}
              />
              <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white text-slate-900 shadow-inner ring-1 ring-slate-200 md:h-32 md:w-32">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total</span>
                <span className="text-3xl font-bold leading-none">{statusTotal}</span>
                <span className="mt-1 text-[11px] text-slate-500">actividades</span>
              </div>
            </div>

            <div className="space-y-2">
              {statusDistribution.map((row) => {
                const percentage = statusTotal === 0 ? 0 : Math.round((row.count / statusTotal) * 100);

                return (
                  <div key={`status-resume-${row.status}`} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                        <span className={`h-2.5 w-2.5 rounded-full ${row.tone}`} />
                        {row.status}
                      </span>
                      <span className="font-semibold text-slate-900">{row.count} ({percentage}%)</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                      <div className={`h-1.5 rounded-full ${row.tone}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {calendarCapabilities.canViewCalendar ? (
            <UnifiedCalendar
              events={calendarEvents}
              mode="summary"
              canViewDailyAgenda={calendarCapabilities.canViewDailyAgenda}
              canViewTeamCalendar={calendarCapabilities.canViewTeamCalendar}
              viewerName={viewerName}
            />
          ) : (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Calendario</h2>
              <p className="mt-2 text-sm text-slate-700">No tienes permiso para ver el calendario.</p>
            </article>
          )}
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Flujo por etapa</h2>
              <p className="mt-1 text-sm text-slate-700">Distribucion del trabajo en el contexto actual.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
              En vivo
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {flow.map((item) => {
              const width = Math.max(8, Math.round((item.count / flowMax) * 100));

              return (
                <div key={item.workflow} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.workflow}</p>
                      <p className="text-base font-semibold text-slate-900">{item.label}</p>
                    </div>
                    <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-900">
                      {item.count}
                    </span>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: `${width}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                    <span>Participacion relativa</span>
                    <span className="font-semibold text-slate-800">{width}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        {dashboardCapabilities.sections.showProjectRisk ? (
        <article className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Riesgo por proyecto</h2>
            <span className="text-sm text-slate-700">Score calculado por vencidas, bloqueos y tareas sin responsable</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-200 text-left text-sm text-slate-800">
                <tr>
                  <th className="px-3 py-2">Proyecto</th>
                  <th className="px-3 py-2">Etapa</th>
                  <th className="px-3 py-2">Responsable</th>
                  <th className="px-3 py-2">Avance</th>
                  <th className="px-3 py-2">Vencidas</th>
                  <th className="px-3 py-2">Bloqueadas</th>
                  <th className="px-3 py-2">Riesgo</th>
                </tr>
              </thead>
              <tbody>
                {riskByProject.map((row) => (
                  <tr key={row.name} className="border-b border-slate-100 text-sm text-slate-900">
                    <td className="px-3 py-3 font-semibold">{row.name}</td>
                    <td className="px-3 py-3">{row.stage}</td>
                    <td className="px-3 py-3">{row.manager}</td>
                    <td className="px-3 py-3">{row.progress}%</td>
                    <td className="px-3 py-3">{row.overdue}</td>
                    <td className="px-3 py-3">{row.blocked}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskTone(row.score)}`}>
                        {row.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        ) : null}

        <article className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${dashboardCapabilities.sections.showProjectRisk ? "" : "xl:col-span-3"}`}>
          <h2 className="text-xl font-semibold text-slate-900">Agenda operativa</h2>
          <div className="mt-4 space-y-3">
            {agenda.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                No hay compromisos, revisiones o entregas en el rango seleccionado.
              </p>
            ) : (
              agenda.map((item) => (
                <div key={`${item.type}-${item.task.id}-${item.date}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-700">{item.type}</span>
                    <span className="text-sm font-semibold text-slate-900">{item.date}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{item.task.project}</p>
                  <p className="text-sm text-slate-800">{item.task.description}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        {dashboardCapabilities.sections.showTeamWorkload ? (
          <article className="xl:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Carga del equipo</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead className="border-b border-slate-200 text-left text-sm text-slate-800">
                  <tr>
                    <th className="px-3 py-2">Responsable</th>
                    <th className="px-3 py-2">Activas</th>
                    <th className="px-3 py-2">En proceso</th>
                    <th className="px-3 py-2">Vencidas</th>
                    <th className="px-3 py-2">Bloqueadas</th>
                    <th className="px-3 py-2">Saturacion</th>
                  </tr>
                </thead>
                <tbody>
                  {workload.map((item) => (
                    <tr key={item.manager} className="border-b border-slate-100 text-sm text-slate-900">
                      <td className="px-3 py-3 font-semibold">{item.manager}</td>
                      <td className="px-3 py-3">{item.total}</td>
                      <td className="px-3 py-3">{item.inProgress}</td>
                      <td className="px-3 py-3">{item.overdue}</td>
                      <td className="px-3 py-3">{item.blocked}</td>
                      <td className="px-3 py-3">
                        <div className="h-2 w-full rounded-full bg-slate-200">
                          <div
                            className="h-2 rounded-full bg-blue-600"
                            style={{ width: `${item.saturation}%` }}
                          />
                        </div>
                        <span className="mt-1 inline-block text-xs font-semibold text-slate-700">{item.saturation}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Alertas accionables</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm text-slate-900">{alert.message}</p>
              <Link
                href={alert.href}
                className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
              >
                Ver detalle
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
