"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { projects as baseProjects } from "@/lib/data/projects";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { presaleTasks } from "@/lib/data/presale";
import type { Task, TaskStatus, WorkflowType } from "@/lib/types/task";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";

const PROJECTS_STORAGE_KEY = "cincel.projects.data.v1";

type ProjectData = (typeof baseProjects)[number];

type DateRangeFilter = "7d" | "30d" | "90d";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

function loadPersistedProjects(): ProjectData[] {
  if (typeof window === "undefined") {
    return baseProjects;
  }

  const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);

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

function loadPersistedTasks(workflow: WorkflowType, fallback: Task[]): Task[] {
  return loadLinkedTasks(workflow, fallback);
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

function formatStageLabel(workflow: WorkflowType): string {
  if (workflow === "Diseño") {
    return "Taller de Diseño";
  }

  return workflow;
}

function workflowHref(workflow: WorkflowType): string {
  if (workflow === "Presale") {
    return "/tareas/presale";
  }

  if (workflow === "Diseño") {
    return "/tareas/diseno";
  }

  return "/tareas/construccion";
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

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function InteractiveDashboard() {
  const [projectsData, setProjectsData] = useState<ProjectData[]>(() => loadPersistedProjects());
  const [tasksVersion, setTasksVersion] = useState(0);
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const [rangeFilter, setRangeFilter] = useState<DateRangeFilter>("30d");
  const [stageFilter, setStageFilter] = useState<"Todas" | WorkflowType>("Todas");
  const [projectFilter, setProjectFilter] = useState("Todos");
  const [managerFilter, setManagerFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState<"Todos" | TaskStatus>("Todos");

  useEffect(() => {
    const refreshAll = () => {
      setProjectsData(loadPersistedProjects());
      setTasksVersion((current) => current + 1);
    };

    window.addEventListener("focus", refreshAll);
    window.addEventListener("storage", refreshAll);

    return () => {
      window.removeEventListener("focus", refreshAll);
      window.removeEventListener("storage", refreshAll);
    };
  }, []);

  const allTasks = useMemo(() => {
    const presale = loadPersistedTasks("Presale", presaleTasks);
    const diseno = loadPersistedTasks("Diseño", disenoTasks);
    const construccion = loadPersistedTasks("Construcción", operativasTasks);

    return [...presale, ...diseno, ...construccion].filter((task) => !task.archived);
  }, [tasksVersion]);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

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
      projectsData
        .filter((project) => project.active)
        .map((project) => project.name)
        .filter(Boolean)
    );

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [projectsData]);

  const managerOptions = useMemo(() => {
    const values = new Set(
      allTasks
        .map((task) => task.manager)
        .filter((manager) => manager && manager.trim().length > 0)
    );

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [allTasks]);

  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      const matchesStage = stageFilter === "Todas" || task.workflow === stageFilter;
      const matchesProject = projectFilter === "Todos" || task.project === projectFilter;
      const matchesManager = managerFilter === "Todos" || task.manager === managerFilter;
      const matchesStatus = statusFilter === "Todos" || task.status === statusFilter;

      const hasDateInRange =
        isDateInRange(task.commitmentDate, today, rangeEnd) ||
        isDateInRange(task.reviewDate, today, rangeEnd);

      return matchesStage && matchesProject && matchesManager && matchesStatus && hasDateInRange;
    });
  }, [allTasks, managerFilter, projectFilter, rangeEnd, stageFilter, statusFilter, today]);

  const kpis = useMemo(() => {
    const activeProjects = projectsData.filter((project) => project.active).length;

    const overdueTasks = filteredTasks.filter((task) => {
      const commitment = toDate(task.commitmentDate);
      return !!commitment && commitment < today && task.status !== "Completado";
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
  }, [filteredTasks, projectsData, today]);

  const riskByProject = useMemo(() => {
    const activeProjects = projectsData.filter((project) => project.active);

    return activeProjects
      .map((project) => {
        const projectTasks = allTasks.filter((task) => task.project === project.name);

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
          const commitment = toDate(task.commitmentDate);
          return !!commitment && commitment < today && task.status !== "Completado";
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
  }, [allTasks, projectsData, today]);

  const agenda = useMemo(() => {
    const nextItems = filteredTasks
      .flatMap((task) => {
        const entries: Array<{ type: "Compromiso" | "Revisión"; date: string; task: Task }> = [];

        if (task.commitmentDate) {
          entries.push({ type: "Compromiso", date: task.commitmentDate, task });
        }

        if (task.reviewDate) {
          entries.push({ type: "Revisión", date: task.reviewDate, task });
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
      const managerTasks = allTasks.filter((task) => task.manager === manager);
      const total = managerTasks.length;
      const inProgress = managerTasks.filter((task) => task.status === "En proceso").length;
      const blocked = managerTasks.filter((task) => task.status === "Bloqueado").length;
      const overdue = managerTasks.filter((task) => {
        const commitment = toDate(task.commitmentDate);
        return !!commitment && commitment < today && task.status !== "Completado";
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
  }, [allTasks, managerOptions, today]);

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

  const alerts = useMemo(() => {
    const overdue = filteredTasks.filter((task) => {
      const commitment = toDate(task.commitmentDate);
      return !!commitment && commitment < today && task.status !== "Completado";
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

  const weeklyTrend = useMemo(() => {
    const buckets: Array<{ label: string; commitments: number; reviews: number }> = [];

    for (let index = 0; index < 6; index += 1) {
      const start = new Date(today);
      start.setDate(today.getDate() + index * 7);

      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const commitments = filteredTasks.filter((task) => isDateInRange(task.commitmentDate, start, end)).length;
      const reviews = filteredTasks.filter((task) => isDateInRange(task.reviewDate, start, end)).length;

      buckets.push({
        label: `S${index + 1}`,
        commitments,
        reviews,
      });
    }

    return buckets;
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
      { status: "Pendiente", count: counts.Pendiente, tone: "bg-amber-500" },
      { status: "En proceso", count: counts["En proceso"], tone: "bg-blue-500" },
      { status: "Completado", count: counts.Completado, tone: "bg-emerald-500" },
      { status: "Bloqueado", count: counts.Bloqueado, tone: "bg-rose-500" },
    ];
  }, [filteredTasks]);

  const monthlyCalendar = useMemo(() => {
    const monthStart = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
    const monthEnd = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 0);

    const leadingEmpty = (monthStart.getDay() + 6) % 7;
    const daysInMonth = monthEnd.getDate();
    const totalCells = Math.ceil((leadingEmpty + daysInMonth) / 7) * 7;

    const eventsByDate = new Map<string, { commitments: number; reviews: number }>();

    filteredTasks.forEach((task) => {
      if (task.commitmentDate) {
        const current = eventsByDate.get(task.commitmentDate) ?? { commitments: 0, reviews: 0 };
        current.commitments += 1;
        eventsByDate.set(task.commitmentDate, current);
      }

      if (task.reviewDate) {
        const current = eventsByDate.get(task.reviewDate) ?? { commitments: 0, reviews: 0 };
        current.reviews += 1;
        eventsByDate.set(task.reviewDate, current);
      }
    });

    const cells = Array.from({ length: totalCells }).map((_, index) => {
      const dayNumber = index - leadingEmpty + 1;

      if (dayNumber < 1 || dayNumber > daysInMonth) {
        return {
          key: `empty-${index}`,
          isCurrentMonth: false,
          isToday: false,
          dayNumber: 0,
          commitments: 0,
          reviews: 0,
        };
      }

      const currentDate = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), dayNumber);
      const key = dateKey(currentDate);
      const eventCount = eventsByDate.get(key) ?? { commitments: 0, reviews: 0 };

      return {
        key,
        isCurrentMonth: true,
        isToday: key === dateKey(today),
        dayNumber,
        commitments: eventCount.commitments,
        reviews: eventCount.reviews,
      };
    });

    return {
      monthLabel: monthStart.toLocaleDateString("es-MX", { month: "long", year: "numeric" }),
      cells,
    };
  }, [calendarCursor, filteredTasks, today]);

  const defaultCalendarDateKey = useMemo(() => {
    if (
      calendarCursor.getFullYear() === today.getFullYear() &&
      calendarCursor.getMonth() === today.getMonth()
    ) {
      return dateKey(today);
    }

    return dateKey(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1));
  }, [calendarCursor, today]);

  const activeCalendarDateKey = selectedCalendarDate ?? defaultCalendarDateKey;

  const selectedDayEvents = useMemo(() => {
    return filteredTasks
      .flatMap((task) => {
        const entries: Array<{ id: string; type: "Compromiso" | "Revisión"; task: Task; href: string }> = [];

        if (task.commitmentDate === activeCalendarDateKey) {
          entries.push({ id: `c-${task.id}`, type: "Compromiso", task, href: `${workflowHref(task.workflow)}?project=${encodeURIComponent(task.project)}` });
        }

        if (task.reviewDate === activeCalendarDateKey) {
          entries.push({ id: `r-${task.id}`, type: "Revisión", task, href: `${workflowHref(task.workflow)}?project=${encodeURIComponent(task.project)}` });
        }

        return entries;
      })
      .sort((a, b) => a.task.project.localeCompare(b.task.project));
  }, [activeCalendarDateKey, filteredTasks]);

  const selectedDayLabel = useMemo(() => {
    const date = toDate(activeCalendarDateKey);

    if (!date) {
      return activeCalendarDateKey;
    }

    return date.toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [activeCalendarDateKey]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard Ejecutivo</h1>
            <p className="mt-2 text-slate-700">Vista unificada de riesgo, agenda y carga operativa.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <select
              value={rangeFilter}
              onChange={(event) => setRangeFilter(event.target.value as DateRangeFilter)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              <option value="7d">Proximos 7 dias</option>
              <option value="30d">Proximos 30 dias</option>
              <option value="90d">Proximos 90 dias</option>
            </select>

            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value as "Todas" | WorkflowType)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              <option value="Todas">Todas las etapas</option>
              <option value="Presale">Presale</option>
              <option value="Diseño">Taller de Diseño</option>
              <option value="Construcción">Construccion</option>
            </select>

            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              <option value="Todos">Todos los proyectos</option>
              {projectOptions.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>

            <select
              value={managerFilter}
              onChange={(event) => setManagerFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              <option value="Todos">Todos los responsables</option>
              {managerOptions.map((manager) => (
                <option key={manager} value={manager}>
                  {manager}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "Todos" | TaskStatus)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              <option value="Todos">Todos los estatus</option>
              <option value="Pendiente">Pendiente</option>
              <option value="En proceso">En proceso</option>
              <option value="Completado">Completado</option>
              <option value="Bloqueado">Bloqueado</option>
            </select>
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

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Mini grafica semanal</h2>
          <p className="mt-1 text-sm text-slate-700">Compromisos y revisiones proximas por semana.</p>
          <div className="mt-4 flex items-end gap-3">
            {weeklyTrend.map((bucket) => {
              const total = bucket.commitments + bucket.reviews;
              const scaled = Math.max(6, total * 10);

              return (
                <div key={bucket.label} className="flex w-full flex-col items-center gap-2">
                  <div className="flex h-28 w-full items-end gap-1">
                    <div className="w-1/2 rounded-t bg-blue-500" style={{ height: `${Math.max(6, bucket.commitments * 10)}px` }} />
                    <div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${Math.max(6, bucket.reviews * 10)}px` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{bucket.label}</span>
                  <span className="text-xs text-slate-700">{scaled > 6 ? total : 0}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Mini grafica de estatus</h2>
          <p className="mt-1 text-sm text-slate-700">Distribucion actual del backlog filtrado.</p>
          <div className="mt-4 space-y-3">
            {statusDistribution.map((row) => {
              const max = Math.max(...statusDistribution.map((item) => item.count), 1);
              const width = Math.max(8, Math.round((row.count / max) * 100));

              return (
                <div key={row.status}>
                  <div className="mb-1 flex items-center justify-between text-sm text-slate-800">
                    <span>{row.status}</span>
                    <span className="font-semibold text-slate-900">{row.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className={`h-2 rounded-full ${row.tone}`} style={{ width: `${row.count === 0 ? 0 : width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Calendario operativo</h2>
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setCalendarCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedCalendarDate(dateKey(now));
                }}
                className="rounded px-2 py-1 text-sm font-medium text-slate-800 hover:bg-slate-100"
                aria-label="Ir a hoy"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => {
                  setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
                  setSelectedCalendarDate(null);
                }}
                className="rounded px-2 py-1 text-sm text-slate-800 hover:bg-slate-100"
                aria-label="Mes anterior"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => {
                  setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
                  setSelectedCalendarDate(null);
                }}
                className="rounded px-2 py-1 text-sm text-slate-800 hover:bg-slate-100"
                aria-label="Mes siguiente"
              >
                →
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm capitalize text-slate-700">{monthlyCalendar.monthLabel}</p>

          <div className="mt-4 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="rounded bg-slate-100 py-1 text-center text-[11px] font-semibold text-slate-700">
                {label}
              </div>
            ))}
            {monthlyCalendar.cells.map((cell) => (
              <button
                key={cell.key}
                type="button"
                onClick={() => {
                  if (!cell.isCurrentMonth) {
                    return;
                  }

                  setSelectedCalendarDate(cell.key);
                }}
                className={`min-h-14 rounded border p-1 text-left ${cell.isCurrentMonth ? "border-slate-200 bg-white hover:border-blue-300" : "border-transparent bg-slate-50"} ${cell.key === activeCalendarDateKey ? "ring-2 ring-blue-500" : ""}`}
              >
                {cell.isCurrentMonth ? (
                  <>
                    <div className={`text-xs font-semibold ${cell.isToday ? "text-blue-700" : "text-slate-800"}`}>{cell.dayNumber}</div>
                    <div className="mt-1 space-y-1">
                      {cell.commitments > 0 ? (
                        <div className="rounded bg-blue-100 px-1 text-[10px] font-medium text-blue-800">C {cell.commitments}</div>
                      ) : null}
                      {cell.reviews > 0 ? (
                        <div className="rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-800">R {cell.reviews}</div>
                      ) : null}
                      {cell.commitments + cell.reviews > 0 ? (
                        <div className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-800">{cell.commitments + cell.reviews} act.</div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">Actividades del dia</p>
            <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{selectedDayLabel}</p>

            {selectedDayEvents.length === 0 ? (
              <p className="mt-2 text-sm text-slate-700">No hay actividades marcadas para este dia.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {selectedDayEvents.map((entry) => (
                  <Link key={entry.id} href={entry.href} className="block rounded-lg border border-slate-200 bg-white px-2 py-2 hover:border-blue-300 hover:bg-blue-50/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${entry.type === "Compromiso" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {entry.type}
                      </span>
                      <span className="text-xs text-slate-700">{formatStageLabel(entry.task.workflow)}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{entry.task.project}</p>
                    <p className="text-sm text-slate-800">{entry.task.description}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
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

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Agenda operativa</h2>
          <div className="mt-4 space-y-3">
            {agenda.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                No hay compromisos o revisiones en el rango seleccionado.
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
        <article className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Flujo por etapa</h2>
          <div className="mt-4 space-y-4">
            {flow.map((item) => {
              const max = Math.max(...flow.map((entry) => entry.count), 1);
              const width = Math.max(10, Math.round((item.count / max) * 100));

              return (
                <div key={item.workflow}>
                  <div className="mb-1 flex items-center justify-between text-sm text-slate-800">
                    <span>{item.label}</span>
                    <span className="font-semibold text-slate-900">{item.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
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
