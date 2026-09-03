"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import ExportMenu from "@/components/ui/ExportMenu";
import InlineEditable from "@/components/ui/InlineEditable";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import type { Task, TaskStatus, WorkflowType } from "@/lib/types/task";
import { formatDateDMY } from "@/lib/utils/date";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { fetchProjects, getProjectsSnapshot } from "@/lib/repositories/projects-repository";
import { fetchActivities, saveActivities } from "@/lib/repositories/activities-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";

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
  return loadLinkedTasks(workflow, fallback);
}

function loadPersistedProjects() {
  return getProjectsSnapshot();
}

function workflowInProjectStage(projectStage: string, workflow: WorkflowType): boolean {
  const stages = projectStage
    .split("/")
    .map((value) => value.trim().toLowerCase());

  if (workflow === "Presale") {
    return stages.some((stage) => stage === "presale");
  }

  if (workflow === "Diseño") {
    return stages.some((stage) => stage === "diseño" || stage === "diseno" || stage === "taller de diseño" || stage === "taller de diseno");
  }

  return stages.some((stage) => stage === "construcción" || stage === "construccion");
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

function statusBadgeClass(status: TaskStatus): string {
  if (status === "Completado") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "Bloqueado") return "bg-red-100 text-red-700 border-red-200";
  if (status === "En proceso") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-800 border-slate-200";
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

function buildTimestampLabel(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "-");
  return `${date}-${time}`;
}

type InitialActivities = {
  presale: Task[];
  diseno: Task[];
  construccion: Task[];
};

export default function TareasPage({
  initialActivities,
}: {
  initialActivities?: InitialActivities;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectFromQuery = searchParams.get("project");
  const [sortBy, setSortBy] = useState<"etapa" | "compromiso" | "estatus">("compromiso");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [responsableFilter, setResponsableFilter] = useState("Todos");
  const [projectsData, setProjectsData] = useState(() => loadPersistedProjects());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const seed = (wf: WorkflowType, rows: Task[] | undefined): Task[] =>
    rows && rows.length > 0
      ? loadLinkedTasks(wf, rows)
      : loadPersistedTasks(wf, getFallbackTasks(wf));
  const [presaleTasksState, setPresaleTasksState] = useState<Task[]>(() =>
    seed("Presale", initialActivities?.presale)
  );
  const [disenoTasksState, setDisenoTasksState] = useState<Task[]>(() =>
    seed("Diseño", initialActivities?.diseno)
  );
  const [construccionTasksState, setConstruccionTasksState] = useState<Task[]>(() =>
    seed("Construcción", initialActivities?.construccion)
  );
  const [isLoadingData, setIsLoadingData] = useState(initialActivities === undefined);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    // Async hydration from Supabase when the data source is configured for it.
    // The individual workflow pages (PresaleTable) do their own per-page fetch;
    // this aggregate view needs its own hydration so it shows live data too.
    const hydrateFromSupabase = async () => {
      if (initialActivities === undefined) setIsLoadingData(true);
      setFetchError(null);
      try {
        const [presale, diseno, construccion, projects] = await Promise.all([
          fetchActivities("Presale"),
          fetchActivities("Diseño"),
          fetchActivities("Construcción"),
          fetchProjects(),
        ]);
        // Keep the mock fallback when a workflow has no DB rows yet, matching
        // PresaleTable — a fresh database shouldn't render an empty board.
        if (presale.length > 0) setPresaleTasksState(loadLinkedTasks("Presale", presale));
        if (diseno.length > 0) setDisenoTasksState(loadLinkedTasks("Diseño", diseno));
        if (construccion.length > 0) setConstruccionTasksState(loadLinkedTasks("Construcción", construccion));
        // The projects dropdown must reflect the DB, not just the mock/localStorage
        // snapshot — otherwise it silently omits projects created after the seed.
        if (projects.length > 0) setProjectsData(projects);
      } catch (err) {
        if (err instanceof RepositoryError) reportRepositoryError(err);
        setFetchError("No se pudo sincronizar con el servidor. Los datos mostrados pueden estar desactualizados.");
      } finally {
        setIsLoadingData(false);
      }
    };

    const refreshProjects = () => {
      setProjectsData(loadPersistedProjects());
      setAuthenticatedUser(getCurrentAuthenticatedUser());
      void hydrateFromSupabase();
    };

    void hydrateFromSupabase();

    window.addEventListener("focus", refreshProjects);
    window.addEventListener("storage", refreshProjects);

    return () => {
      window.removeEventListener("focus", refreshProjects);
      window.removeEventListener("storage", refreshProjects);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activitiesCapabilities = useMemo(() => {
    return resolveActivitiesCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  const viewerName = authenticatedUser?.member.name || "";

  function getTasksForWorkflow(workflow: WorkflowType): Task[] {
    if (workflow === "Presale") return presaleTasksState;
    if (workflow === "Diseño") return disenoTasksState;
    return construccionTasksState;
  }

  function setTasksForWorkflow(workflow: WorkflowType, tasks: Task[]): void {
    if (workflow === "Presale") setPresaleTasksState(tasks);
    else if (workflow === "Diseño") setDisenoTasksState(tasks);
    else setConstruccionTasksState(tasks);
  }

  const updateTaskInline = (
    workflow: WorkflowType,
    taskId: number,
    changes: Partial<Pick<Task, "status" | "manager" | "commitmentDate" | "reviewDate" | "deliveryDate">>
  ) => {
    const currentTasks = getTasksForWorkflow(workflow);

    const updatedTasks = currentTasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            ...changes,
            updatedAt: "Hoy",
          }
        : task
    );

    setTasksForWorkflow(workflow, updatedTasks);
    const changed = updatedTasks.filter((t) => t.id === taskId);
    saveActivities(workflow, changed).catch((err: unknown) => {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    });
  };

  const getDeliveryDate = (task: Task): string => {
    return task.deliveryDate || task.commitmentDate || "";
  };

  const unifiedStageData = [
    {
      title: "Presale",
      workflow: "Presale" as WorkflowType,
      href: "/tareas/presale",
      tasks: presaleTasksState,
      toneClassName: "border-blue-100 bg-blue-50/40",
    },
    {
      title: "Taller de Diseño",
      workflow: "Diseño" as WorkflowType,
      href: "/tareas/diseno",
      tasks: disenoTasksState,
      toneClassName: "border-emerald-100 bg-emerald-50/40",
    },
    {
      title: "Construcción",
      workflow: "Construcción" as WorkflowType,
      href: "/tareas/construccion",
      tasks: construccionTasksState,
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

  const stageProjectsFromData = useMemo(() => {
    return {
      Presale: getProjects(
        projectsData
          .filter((project) => project.active)
          .filter((project) => workflowInProjectStage(project.stage, "Presale"))
          .map((project) => project.name)
      ),
      Diseño: getProjects(
        projectsData
          .filter((project) => project.active)
          .filter((project) => workflowInProjectStage(project.stage, "Diseño"))
          .map((project) => project.name)
      ),
      Construcción: getProjects(
        projectsData
          .filter((project) => project.active)
          .filter((project) => workflowInProjectStage(project.stage, "Construcción"))
          .map((project) => project.name)
      ),
    };
  }, [projectsData]);

  const projectOptions = useMemo(() => {
    const activeProjects = projectsData
      .filter((project) => project.active)
      .map((project) => project.name)
      .filter(Boolean);

    const options = Array.from(new Set(activeProjects)).sort((a, b) => a.localeCompare(b));

    if (projectFromQuery && !options.includes(projectFromQuery)) {
      return [projectFromQuery, ...options];
    }

    return options;
  }, [projectFromQuery, projectsData]);

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

        const aDeliveryDate = getDeliveryDate(a.task);
        const bDeliveryDate = getDeliveryDate(b.task);
        const aDate = aDeliveryDate ? new Date(aDeliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = bDeliveryDate ? new Date(bDeliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
        const dateDiff = aDate - bDate;
        return sortDirection === "asc" ? dateDiff : -dateDiff;
      }

      if (sortBy === "estatus") {
        const statusDiff = statusRank(a.task.status) - statusRank(b.task.status);
        if (statusDiff !== 0) {
          return sortDirection === "asc" ? statusDiff : -statusDiff;
        }

        const aDeliveryDate = getDeliveryDate(a.task);
        const bDeliveryDate = getDeliveryDate(b.task);
        const aDate = aDeliveryDate ? new Date(aDeliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = bDeliveryDate ? new Date(bDeliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
        const dateDiff = aDate - bDate;
        return sortDirection === "asc" ? dateDiff : -dateDiff;
      }

      const aDeliveryDate = getDeliveryDate(a.task);
      const bDeliveryDate = getDeliveryDate(b.task);
      const aDate = aDeliveryDate ? new Date(aDeliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = bDeliveryDate ? new Date(bDeliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
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

  const activitiesExportColumns = useMemo<Array<ExportColumn<(typeof unifiedRows)[number]>>>(() => {
    return [
      {
        key: "stage",
        header: "Etapa",
        getValue: (row) => row.stageTitle,
      },
      {
        key: "phase",
        header: "Fase",
        getValue: (row) => row.task.phase,
      },
      {
        key: "description",
        header: "Actividad",
        getValue: (row) => row.task.description,
      },
      {
        key: "manager",
        header: "Responsable",
        getValue: (row) => row.task.manager || "Sin responsable",
      },
      {
        key: "team",
        header: "Equipo",
        getValue: (row) => row.task.support?.join(", ") || "Sin equipo",
      },
      {
        key: "commitment",
        header: "Compromiso",
        isDate: true,
        getValue: (row) => row.task.commitmentDate || "",
      },
      {
        key: "tracking",
        header: "Seguimiento",
        isDate: true,
        getValue: (row) => row.task.reviewDate || "",
      },
      {
        key: "reviewDate",
        header: "Proxima revision",
        isDate: true,
        getValue: (row) => row.task.reviewDate || "",
      },
      {
        key: "deliveryDate",
        header: "Fecha de entrega",
        isDate: true,
        getValue: (row) => getDeliveryDate(row.task),
      },
      {
        key: "status",
        header: "Estatus",
        getValue: (row) => row.task.status,
      },
    ];
  }, []);

  const unifiedColumns = useMemo<ColumnDef<(typeof unifiedRows)[number], unknown>[]>(() => {
    return [
      {
        id: "stage",
        accessorFn: (row) => row.stageTitle,
        header: "Etapa",
        cell: ({ row }) => (
          <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium ${stageBadgeClass(row.original.stageTitle)}`}>
            {row.original.stageTitle}
          </span>
        ),
      },
      {
        id: "phase",
        accessorFn: (row) => row.task.phase,
        header: "Fase",
        cell: ({ row }) => row.original.task.phase,
      },
      {
        id: "description",
        accessorFn: (row) => row.task.description,
        header: "Actividad",
        cell: ({ row }) => <span className="font-medium">{row.original.task.description}</span>,
      },
      {
        id: "manager",
        accessorFn: (row) => row.task.manager || "Sin responsable",
        header: "Responsable",
        cell: ({ row }) => {
          const { workflow, task } = row.original;
          return (
            <div className="flex items-center gap-2">
              <Avatar name={task.manager || "Sin responsable"} showName={false} />
              {activitiesCapabilities.canChangeResponsible ? (
                <select
                  value={task.manager || "Sin responsable"}
                  onChange={(event) =>
                    updateTaskInline(workflow, task.id, {
                      manager: event.target.value,
                    })
                  }
                  className="rounded-xl border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 focus:border-slate-200 focus:bg-white"
                  aria-label={`Responsable de ${task.description}`}
                >
                  {TEAM_MEMBERS.map((member) => (
                    <option key={`manager-${task.id}-${member}`} value={member}>
                      {member}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="px-2 py-1 text-sm text-slate-800">{task.manager || "Sin responsable"}</span>
              )}
            </div>
          );
        },
      },
      {
        id: "team",
        accessorFn: (row) => (row.task.support && row.task.support.length > 0 ? row.task.support.join(", ") : "Sin equipo"),
        header: "Equipo",
        cell: ({ row }) => (
          <span className="text-sm text-slate-600">{row.original.task.support?.join(", ") || "Sin equipo"}</span>
        ),
      },
      {
        id: "commitment",
        accessorFn: (row) => row.task.commitmentDate || "",
        header: "Compromiso",
        cell: ({ row }) => (
          <span suppressHydrationWarning>{formatDateDMY(row.original.task.commitmentDate)}</span>
        ),
      },
      {
        id: "tracking",
        accessorFn: (row) => row.task.reviewDate || "",
        header: "Seguimiento",
        cell: ({ row }) => (
          <span suppressHydrationWarning>{formatDateDMY(row.original.task.reviewDate)}</span>
        ),
      },
      {
        id: "reviewDate",
        accessorFn: (row) => row.task.reviewDate || "",
        header: "Próxima revisión",
        cell: ({ row }) => {
          const { workflow, task } = row.original;
          return (
            <InlineEditable
              value={task.reviewDate || ""}
              onCommit={(value) =>
                updateTaskInline(workflow, task.id, {
                  reviewDate: value,
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
                  aria-label={`Próxima revisión de ${task.description}`}
                />
              )}
            />
          );
        },
      },
      {
        id: "deliveryDate",
        accessorFn: (row) => getDeliveryDate(row.task),
        header: "Fecha de entrega",
        cell: ({ row }) => {
          const { workflow, task } = row.original;
          return (
            <InlineEditable
              value={getDeliveryDate(task)}
              onCommit={(value) =>
                updateTaskInline(workflow, task.id, {
                  deliveryDate: value,
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
                  aria-label={`Fecha de entrega de ${task.description}`}
                />
              )}
            />
          );
        },
      },
      {
        id: "status",
        accessorFn: (row) => row.task.status,
        header: "Estatus",
        cell: ({ row }) => {
          const { workflow, task } = row.original;
          return canChangeActivityStatus({
            capabilities: activitiesCapabilities,
            task,
            viewerName,
          }) ? (
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
          ) : (
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(task.status)}`}>
              {task.status}
            </span>
          );
        },
      },
      {
        id: "action",
        header: "Acción",
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={{ pathname: row.original.stageHref, query: { project: projectFromQuery } }}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-50"
          >
            Abrir etapa
          </Link>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitiesCapabilities, viewerName, projectFromQuery]);

  const exportActivities = async (format: "xlsx" | "pdf") => {
    const { settings } = loadGeneralSettings();

    await exportTableData({
      moduleName: "Actividades",
      fileName: `actividades-${buildTimestampLabel()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: activitiesExportColumns,
      rows: unifiedRows,
      landscape: true,
    });
  };

  const stageCards = [
    {
      title: "Presale",
      href: "/tareas/presale",
      projects: stageProjectsFromData.Presale,
      toneClassName: "border-blue-100 bg-blue-50/40",
    },
    {
      title: "Taller de Diseño",
      href: "/tareas/diseno",
      projects: stageProjectsFromData.Diseño,
      toneClassName: "border-emerald-100 bg-emerald-50/40",
    },
    {
      title: "Construcción",
      href: "/tareas/construccion",
      projects: stageProjectsFromData.Construcción,
      toneClassName: "border-amber-100 bg-amber-50/40",
    },
  ];

  const selectedProject = projectFromQuery ? projectsData.find((p) => p.name === projectFromQuery) : null;
  const driveInternalUrl = selectedProject?.drive?.administrativo || "";
  const driveClientUrl = selectedProject?.drive?.reportes || "";
  const docsSetupHref = selectedProject ? `/proyectos/${selectedProject.id}/ficha?edit=docs` : "/proyectos";

  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">

        <Header />

        {isLoadingData && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Sincronizando actividades con el servidor...
          </div>
        )}
        {fetchError && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="mt-0.5 shrink-0">&#9888;</span>
            {fetchError}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">

          <h1 className="text-3xl font-bold">
            Actividades
          </h1>

          <p className="text-slate-800 mt-2">
            Selecciona una etapa y revisa los proyectos activos.
          </p>

          <div className="mt-6 rounded-2xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 via-white to-cyan-50 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Filtro principal</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Proyecto</h2>
                <p className="mt-1 text-sm text-slate-700">Elige un proyecto para enfocar toda la ventana de actividades.</p>
              </div>

              <div className="w-full lg:max-w-md">
                <label htmlFor="project-filter" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                  Proyectos
                </label>
                <select
                  id="project-filter"
                  value={projectFromQuery ?? ""}
                  onChange={(event) => updateProjectFromMenu(event.target.value)}
                  className="w-full rounded-xl border border-blue-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
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
            </div>

            {projectFromQuery ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                  Proyecto activo: {projectFromQuery}
                </span>
                <button
                  type="button"
                  onClick={() => updateProjectFromMenu("")}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Ver todos
                </button>
              </div>
            ) : null}
          </div>

          {projectFromQuery ? (
            <div className="mt-8 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-xl font-semibold text-slate-900">
                  Vista unificada en una sola ventana
                </h2>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-2 py-2">
                  {driveInternalUrl ? (
                    <a
                      href={driveInternalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      Docs del proyecto
                    </a>
                  ) : (
                    <Link
                      href={docsSetupHref}
                      className="rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
                    >
                      (+) Docs del proyecto
                    </Link>
                  )}

                  {driveClientUrl ? (
                    <a
                      href={driveClientUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-cyan-600 bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700"
                    >
                      Docs del cliente
                    </a>
                  ) : (
                    <Link
                      href={docsSetupHref}
                      className="rounded-lg border border-cyan-600 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 shadow-sm transition hover:bg-cyan-50"
                    >
                      (+) Docs del cliente
                    </Link>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-800">Total actividades</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{unifiedTotal}</p>
                </div>
                {unifiedStageData.map((stage) => (
                  <div key={`count-${stage.title}`} className={`rounded-xl border p-3 ${stage.toneClassName}`}>
                    <p className="text-xs text-slate-800">{stage.title}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{stage.totalCount}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-medium text-slate-800">Ordenar por</p>

                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as "etapa" | "compromiso" | "estatus")}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  >
                    <option value="etapa">Etapa</option>
                    <option value="compromiso">Compromiso</option>
                    <option value="estatus">Estatus</option>
                  </select>

                  <select
                    value={sortDirection}
                    onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  >
                    <option value="asc">Ascendente</option>
                    <option value="desc">Descendente</option>
                  </select>

                  <span className="ml-2 text-sm font-medium text-slate-800">Responsable</span>
                  <select
                    value={responsableFilter}
                    onChange={(event) => setResponsableFilter(event.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  >
                    {responsibleOptions.map((manager) => (
                      <option key={`responsable-filter-${manager}`} value={manager}>
                        {manager}
                      </option>
                    ))}
                  </select>
                </div>

                {activitiesCapabilities.canExportData ? (
                  <ExportMenu onExport={exportActivities} />
                ) : null}
              </div>

              <DataTable
                columns={unifiedColumns}
                data={unifiedRows}
                getRowId={(row) => `${row.stageTitle}-${row.task.id}`}
                tableClassName="min-w-[1120px] bg-white"
                emptyMessage="No hay actividades registradas para este proyecto."
              />
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
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800">
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
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
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