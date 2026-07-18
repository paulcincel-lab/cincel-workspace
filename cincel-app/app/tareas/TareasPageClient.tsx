"use client";

import { useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import InlineEditableField from "@/components/ui/InlineEditableField";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import type { Task, TaskStatus, WorkflowType } from "@/lib/types/task";
import { formatDateDMY } from "@/lib/utils/date";

const TASK_STATUSES: TaskStatus[] = ["Pendiente", "En proceso", "Completado", "Bloqueado"];
const TEAM_MEMBERS = [
  "Sin responsable",
  "Juanma",
  "Paul",
  "Rafa",
  "Aaron",
  "Gabriel",
  "Alejandro",
  "Rodrigo",
];

function getProjects(projects: string[]) {
  return Array.from(new Set(projects)).sort((a, b) => a.localeCompare(b));
}

function loadPersistedTasks(workflow: WorkflowType, fallback: Task[]): Task[] {
  if (typeof window === "undefined") {
    return fallback;
  }

  const storageKey = `cincel.actividades.${workflow}.tasks.v1`;
  const stored = localStorage.getItem(storageKey);

  if (!stored) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(stored) as Task[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    localStorage.removeItem(storageKey);
    return fallback;
  }
}

function getFallbackTasks(workflow: WorkflowType): Task[] {
  if (workflow === "Presale") {
    return presaleTasks;
  }

  if (workflow === "Diseño") {
    return disenoTasks;
  }

  return operativasTasks;
}

function getTasksStorageKey(workflow: WorkflowType): string {
  return `cincel.actividades.${workflow}.tasks.v1`;
}

function statusBadgeClass(status: TaskStatus): string {
  if (status === "Completado") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "Bloqueado") return "bg-red-100 text-red-700 border-red-200";
  if (status === "En proceso") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function stageBadgeClass(stageTitle: string): string {
  if (stageTitle === "Presale") return "bg-blue-100 text-blue-700 border-blue-200";
  if (stageTitle === "Taller de Diseño") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function statusRank(status: TaskStatus): number {
  if (status === "Bloqueado") return 0;
  if (status === "En proceso") return 1;
  if (status === "Pendiente") return 2;
  return 3;
}

function stageRank(stageTitle: string): number {
  if (stageTitle === "Presale") return 0;
  if (stageTitle === "Taller de Diseño") return 1;
  return 2;
}

export default function TareasPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectFromQuery = searchParams.get("project");
  const [sortBy, setSortBy] = useState<"etapa" | "compromiso" | "estatus">("compromiso");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [responsableFilter, setResponsableFilter] = useState("Todos");
  const [, setTasksVersion] = useState(0);

  const toggleSort = (field: "etapa" | "compromiso" | "estatus") => {
    if (sortBy === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(field);
    setSortDirection("asc");
  };

  const getSortLabel = (field: "etapa" | "compromiso" | "estatus") => {
    if (sortBy !== field) {
      return "";
    }

    return sortDirection === "asc" ? "(asc)" : "(desc)";
  };

  const updateTaskInline = (
    workflow: WorkflowType,
    taskId: number,
    changes: Partial<Pick<Task, "status" | "manager" | "commitmentDate">>
  ) => {
    if (typeof window === "undefined") {
      return;
    }

    const fallbackTasks = getFallbackTasks(workflow);
    const currentTasks = loadPersistedTasks(workflow, fallbackTasks);

    const updatedTasks = currentTasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            ...changes,
            updatedAt: "Hoy",
          }
        : task
    );

    localStorage.setItem(getTasksStorageKey(workflow), JSON.stringify(updatedTasks));
    setTasksVersion((value) => value + 1);
  };

  const unifiedStageData = [
    {
      title: "Presale",
      workflow: "Presale" as WorkflowType,
      href: "/tareas/presale",
      tasks: loadPersistedTasks("Presale", getFallbackTasks("Presale")),
      toneClassName: "border-blue-100 bg-blue-50/40",
    },
    {
      title: "Taller de Diseño",
      workflow: "Diseño" as WorkflowType,
      href: "/tareas/diseno",
      tasks: loadPersistedTasks("Diseño", getFallbackTasks("Diseño")),
      toneClassName: "border-emerald-100 bg-emerald-50/40",
    },
    {
      title: "Construcción",
      workflow: "Construcción" as WorkflowType,
      href: "/tareas/construccion",
      tasks: loadPersistedTasks("Construcción", getFallbackTasks("Construcción")),
      toneClassName: "border-amber-100 bg-amber-50/40",
    },
  ].map((stage) => {
    const visibleTasks = stage.tasks
      .filter((task) => !task.archived)
      .filter((task) => !projectFromQuery || task.project === projectFromQuery);

    return {
      ...stage,
      visibleTasks,
      totalCount: stage.tasks.filter((task) => !task.archived && (!projectFromQuery || task.project === projectFromQuery)).length,
    };
  });

  const projectOptions = useMemo(() => {
    const allProjects = unifiedStageData.flatMap((stage) => stage.tasks.map((task) => task.project));
    return Array.from(new Set(allProjects)).sort((a, b) => a.localeCompare(b));
  }, [unifiedStageData]);

  const updateProjectFromMenu = (nextProject: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (!nextProject) {
      params.delete("project");
    } else {
      params.set("project", nextProject);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const responsibleOptions = useMemo(() => {
    const managers = unifiedStageData.flatMap((stage) =>
      stage.visibleTasks.map((task) => task.manager || "Sin responsable")
    );

    return ["Todos", ...Array.from(new Set(managers)).sort((a, b) => a.localeCompare(b))];
  }, [unifiedStageData]);

  const unifiedRows = useMemo(() => {
    const rows = unifiedStageData
      .flatMap((stage) =>
        stage.visibleTasks.map((task) => ({
          stageTitle: stage.title,
          workflow: stage.workflow,
          stageHref: stage.href,
          task,
        }))
      )
      .filter(({ task }) =>
        responsableFilter === "Todos" || (task.manager || "Sin responsable") === responsableFilter
      );

    rows.sort((a, b) => {
      if (sortBy === "etapa") {
        const stageDiff = stageRank(a.stageTitle) - stageRank(b.stageTitle);
        if (stageDiff !== 0) {
          return sortDirection === "asc" ? stageDiff : -stageDiff;
        }

        const aDate = a.task.commitmentDate ? new Date(a.task.commitmentDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.task.commitmentDate ? new Date(b.task.commitmentDate).getTime() : Number.MAX_SAFE_INTEGER;
        const dateDiff = aDate - bDate;
        return sortDirection === "asc" ? dateDiff : -dateDiff;
      }

      if (sortBy === "estatus") {
        const statusDiff = statusRank(a.task.status) - statusRank(b.task.status);
        if (statusDiff !== 0) {
          return sortDirection === "asc" ? statusDiff : -statusDiff;
        }

        const aDate = a.task.commitmentDate ? new Date(a.task.commitmentDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.task.commitmentDate ? new Date(b.task.commitmentDate).getTime() : Number.MAX_SAFE_INTEGER;
        const dateDiff = aDate - bDate;
        return sortDirection === "asc" ? dateDiff : -dateDiff;
      }

      const aDate = a.task.commitmentDate ? new Date(a.task.commitmentDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.task.commitmentDate ? new Date(b.task.commitmentDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dateDiff = aDate - bDate;

      if (dateDiff !== 0) {
        return sortDirection === "asc" ? dateDiff : -dateDiff;
      }

      const fallbackDiff = statusRank(a.task.status) - statusRank(b.task.status);
      return sortDirection === "asc" ? fallbackDiff : -fallbackDiff;
    });

    return rows;
  }, [responsableFilter, sortBy, sortDirection, unifiedStageData]);

  const unifiedTotal = useMemo(() => {
    return unifiedStageData.reduce((acc, stage) => acc + stage.totalCount, 0);
  }, [unifiedStageData]);

  const stageCards = [
    {
      title: "Presale",
      href: "/tareas/presale",
      projects: getProjects(presaleTasks.map((task) => task.project)),
      toneClassName: "border-blue-100 bg-blue-50/40",
    },
    {
      title: "Taller de Diseño",
      href: "/tareas/diseno",
      projects: getProjects(disenoTasks.map((task) => task.project)),
      toneClassName: "border-emerald-100 bg-emerald-50/40",
    },
    {
      title: "Construcción",
      href: "/tareas/construccion",
      projects: getProjects(operativasTasks.map((task) => task.project)),
      toneClassName: "border-amber-100 bg-amber-50/40",
    },
  ];

  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">

        <Header />

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">

          <h1 className="text-3xl font-bold">
            Actividades
          </h1>

          <p className="text-slate-500 mt-2">
            Selecciona una etapa y revisa los proyectos activos.
          </p>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
            <span>Proyecto:</span>
            <select
              value={projectFromQuery ?? ""}
              onChange={(event) => updateProjectFromMenu(event.target.value)}
              className="rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-slate-800 focus:border-slate-200 focus:bg-white"
              aria-label="Cambiar proyecto seleccionado"
            >
              <option value="">Todos los proyectos</option>
              {projectOptions.map((project) => (
                <option key={`selected-project-${project}`} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </div>

          {projectFromQuery ? (
            <div className="mt-8 space-y-4">
              <h2 className="text-xl font-semibold text-slate-900">
                Vista unificada en una sola ventana
              </h2>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Total actividades</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{unifiedTotal}</p>
                </div>
                {unifiedStageData.map((stage) => (
                  <div key={`count-${stage.title}`} className={`rounded-xl border p-3 ${stage.toneClassName}`}>
                    <p className="text-xs text-slate-500">{stage.title}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{stage.totalCount}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-700">Ordenar por</p>

                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as "etapa" | "compromiso" | "estatus")}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <option value="etapa">Etapa</option>
                  <option value="compromiso">Compromiso</option>
                  <option value="estatus">Estatus</option>
                </select>

                <select
                  value={sortDirection}
                  onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </select>

                <span className="ml-2 text-sm font-medium text-slate-700">Responsable</span>
                <select
                  value={responsableFilter}
                  onChange={(event) => setResponsableFilter(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  {responsibleOptions.map((manager) => (
                    <option key={`responsable-filter-${manager}`} value={manager}>
                      {manager}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[980px] w-full bg-white">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSort("etapa")}
                          className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-blue-700"
                        >
                          Etapa
                          <span className="text-[11px] normal-case text-slate-500">{getSortLabel("etapa")}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3">Fase</th>
                      <th className="px-4 py-3">Actividad</th>
                      <th className="px-4 py-3">Responsable</th>
                      <th className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSort("compromiso")}
                          className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-blue-700"
                        >
                          Compromiso
                          <span className="text-[11px] normal-case text-slate-500">{getSortLabel("compromiso")}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSort("estatus")}
                          className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-blue-700"
                        >
                          Estatus
                          <span className="text-[11px] normal-case text-slate-500">{getSortLabel("estatus")}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unifiedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                          No hay actividades registradas para este proyecto.
                        </td>
                      </tr>
                    ) : (
                      unifiedRows.map(({ stageTitle, workflow, stageHref, task }) => (
                        <tr key={`${stageTitle}-${task.id}`} className="border-b border-slate-100 text-sm text-slate-800 hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-1 text-xs font-medium ${stageBadgeClass(stageTitle)}`}>
                              {stageTitle}
                            </span>
                          </td>
                          <td className="px-4 py-3">{task.phase}</td>
                          <td className="px-4 py-3 font-medium">{task.description}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Avatar name={task.manager || "Sin responsable"} showName={false} />
                              <select
                                value={task.manager || "Sin responsable"}
                                onChange={(event) =>
                                  updateTaskInline(workflow, task.id, {
                                    manager: event.target.value,
                                  })
                                }
                                className="rounded-xl border border-transparent bg-transparent px-2 py-1 text-sm text-slate-700 focus:border-slate-200 focus:bg-white"
                                aria-label={`Responsable de ${task.description}`}
                              >
                                {TEAM_MEMBERS.map((member) => (
                                  <option key={`manager-${task.id}-${member}`} value={member}>
                                    {member}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <InlineEditableField
                              value={task.commitmentDate || ""}
                              onCommit={(value) =>
                                updateTaskInline(workflow, task.id, {
                                  commitmentDate: value,
                                })
                              }
                              renderDisplay={(value) => <span>{formatDateDMY(value)}</span>}
                              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                                <input
                                  autoFocus
                                  type="date"
                                  value={value}
                                  onChange={(event) => onChange(event.target.value)}
                                  onBlur={onBlur}
                                  onKeyDown={onKeyDown}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                  aria-label={`Compromiso de ${task.description}`}
                                />
                              )}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={task.status}
                              onChange={(event) =>
                                updateTaskInline(workflow, task.id, {
                                  status: event.target.value as TaskStatus,
                                })
                              }
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(task.status)}`}
                            >
                              {TASK_STATUSES.map((status) => (
                                <option key={`status-${task.id}-${status}`} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={{ pathname: stageHref, query: { project: projectFromQuery } }}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              Abrir etapa
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="mt-10 space-y-5">
            {stageCards.map((stage) => (
              <div key={stage.title} className={`rounded-2xl border p-6 ${stage.toneClassName}`}>
                <Link
                  href={projectFromQuery ? { pathname: stage.href, query: { project: projectFromQuery } } : stage.href}
                  className="inline-flex items-center text-2xl font-bold text-slate-900 hover:text-blue-700"
                >
                  {stage.title}
                </Link>

                <div className="mt-4 flex flex-wrap gap-2">
                  {stage.projects.length === 0 ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-500">
                      Sin proyectos
                    </span>
                  ) : (
                    stage.projects
                      .filter((project) => !projectFromQuery || project === projectFromQuery)
                      .map((project) => (
                        <Link
                          key={`${stage.title}-${project}`}
                          href={{
                            pathname: stage.href,
                            query: { project },
                          }}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        >
                          {project}
                        </Link>
                      ))
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>

      </section>

    </main>
  );
}