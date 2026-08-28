"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import type { Task, TaskStatus, TaskHistoryItem, WorkflowType } from "@/lib/types/task";
import { presaleTasks } from "@/lib/data/presale";

import PresaleRow from "./PresaleRow";
import TaskDrawer from "./TaskDrawer";
import NewTaskModal from "./NewTaskModal";
import NewProjectTemplateModal from "./NewProjectTemplateModal";
import GroupSection from "@/components/ui/GroupSection";
import ExportMenu from "@/components/ui/ExportMenu";
import { presaleTemplate } from "@/lib/templates/presale";
import { presalePhaseOptions } from "@/lib/templates/phase-options";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { projects as baseProjects } from "@/lib/data/projects";
import { getProjectsSnapshot } from "@/lib/repositories/projects-repository";
import { fetchActivities, saveActivities, mirrorActivitiesToStorage } from "@/lib/repositories/activities-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";

type TaskFormValues = {
  project: string;
  phase: string;
  description: string;
  manager: string;
  status: TaskStatus;
  notes: string;
  commitmentDate: string;
  reviewDate: string;
};

type TemplateItem = {
  phase: string;
  description: string;
};

type Props = {
  title?: string;
  subtitle?: string;
  workflow?: WorkflowType;
  initialTasks?: Task[];
  /** Server-rendered rows from Postgres — seed state without a client fetch. */
  serverTasks?: Task[];
  templateItems?: TemplateItem[];
  templateName?: string;
  phaseOptions?: string[];
};

const availableTeamMembers = [
  "Sin responsable",
  "Juanma",
  "Paul",
  "Rafa",
  "Aaron",
  "Gabriel",
  "Alejandro",
  "Rodrigo",
];

const PROJECT_TONES = [
  {
    headerClassName: "bg-blue-50",
    titleClassName: "text-blue-700",
  },
  {
    headerClassName: "bg-emerald-50",
    titleClassName: "text-emerald-700",
  },
  {
    headerClassName: "bg-amber-50",
    titleClassName: "text-amber-700",
  },
  {
    headerClassName: "bg-rose-50",
    titleClassName: "text-rose-700",
  },
  {
    headerClassName: "bg-violet-50",
    titleClassName: "text-violet-700",
  },
  {
    headerClassName: "bg-cyan-50",
    titleClassName: "text-cyan-700",
  },
];

function loadPersistedProjects() {
  const snapshot = getProjectsSnapshot();
  return snapshot.length > 0 ? snapshot : baseProjects;
}

function createTaskFromValues(
  values: TaskFormValues,
  id: number,
  workflow: WorkflowType
): Task {
  const today = new Date().toISOString().slice(0, 10);
  const history: TaskHistoryItem[] = values.notes.trim()
    ? [
        {
          id: Date.now(),
          date: today,
          author: values.manager,
          comment: values.notes.trim(),
        },
      ]
    : [];

  return {
    id,
    project: values.project,
    workflow,
    phase: values.phase,
    description: values.description,
    notes: values.notes,
    manager: values.manager,
    support: [],
    status: values.status,
    priority: "Media",
    commitmentDate: values.commitmentDate,
    reviewDate: values.reviewDate,
    deliveryDate: "",
    updatedAt: "Hoy",
    createdAt: today,
    history,
    checklist: [],
    archived: false,
  };
}

function buildTimestampLabel(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "-");
  return `${date}-${time}`;
}

export default function PresaleTable({
  title = "Presale",
  subtitle = "Flujo inicial",
  workflow = "Presale",
  initialTasks = presaleTasks,
  serverTasks,
  templateItems = presaleTemplate,
  templateName = "Presale",
  phaseOptions = presalePhaseOptions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectFromQuery = searchParams.get("project");
  const projectFilter = projectFromQuery || "Todos los proyectos";

  const [tasks, setTasks] = useState<Task[]>(() =>
    serverTasks && serverTasks.length > 0
      ? loadLinkedTasks(workflow, serverTasks)
      : loadLinkedTasks(workflow, initialTasks)
  );

  const [search, setSearch] = useState("");

  const [managerFilter, setManagerFilter] =
    useState("Todos");

  const [teamFilter, setTeamFilter] =
    useState("Todos");

  const [statusFilter, setStatusFilter] =
    useState("Todos");

  const [deliveryDateFilter, setDeliveryDateFilter] =
    useState("");

  const [selectedTask, setSelectedTask] =
    useState<Task | null>(null);

  const [showNewTask, setShowNewTask] =
    useState(false);

  const [showProjectTemplateModal, setShowProjectTemplateModal] =
    useState(false);

  const [projectsData, setProjectsData] = useState(() => loadPersistedProjects());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());

  const [archiveView, setArchiveView] = useState<"activos" | "archivadas">("activos");

  const updateProjectFilter = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "Todos los proyectos") {
      params.delete("project");
    } else {
      params.set("project", value);
    }

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  // Diffed autosave: only the tasks that actually changed since the last
  // persisted state are sent (a full-array upsert on every keystroke was too
  // heavy — dozens of queries per change). `lastSavedRef` is seeded from the
  // initial state and reset on hydration so neither the mount value nor the
  // hydration set counts as a user change.
  const lastSavedRef = useRef<Task[]>(tasks);
  useEffect(() => {
    const changed = tasks.filter((task) => {
      const saved = lastSavedRef.current.find((t) => t.id === task.id);
      return !saved || JSON.stringify(task) !== JSON.stringify(saved);
    });
    if (changed.length === 0) return;
    lastSavedRef.current = tasks;
    mirrorActivitiesToStorage(workflow, tasks);
    saveActivities(workflow, changed).catch((err: unknown) => {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    });
  }, [tasks, workflow]);

  useEffect(() => {
    const hydrateTasks = async () => {
      try {
        const remote = await fetchActivities(workflow);
        if (remote.length > 0) {
          const linked = loadLinkedTasks(workflow, remote);
          lastSavedRef.current = linked;
          setTasks(linked);
        }
      } catch (err) {
        if (err instanceof RepositoryError) {
          reportRepositoryError(err);
        }
      }
    };

    void hydrateTasks();
  }, [workflow]);

  useEffect(() => {
    const refreshProjects = () => {
      setProjectsData(loadPersistedProjects());
      setAuthenticatedUser(getCurrentAuthenticatedUser());
    };

    window.addEventListener("focus", refreshProjects);
    window.addEventListener("storage", refreshProjects);

    return () => {
      window.removeEventListener("focus", refreshProjects);
      window.removeEventListener("storage", refreshProjects);
    };
  }, []);

  const activitiesCapabilities = useMemo(() => {
    return resolveActivitiesCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  const viewerName = authenticatedUser?.member.name || "";

  const managers = [
    "Todos",
    ...new Set(tasks.map((task) => task.manager)),
  ];

  const activeProjects = useMemo(() => {
    const activeNames = projectsData
      .filter((project) => project.active)
      .map((project) => (typeof project.name === "string" ? project.name.trim() : ""))
      .filter(Boolean);

    return Array.from(new Set(activeNames)).sort((a, b) => a.localeCompare(b));
  }, [projectsData]);

  const projects = useMemo(() => {
    return ["Todos los proyectos", ...activeProjects];
  }, [activeProjects]);

  const activeProjectsForTemplate = useMemo(() => {
    return activeProjects;
  }, [activeProjects]);

  const teams = [
    "Todos",
    ...new Set(tasks.flatMap((task) => task.support)),
  ];

  const statuses = [
    "Todos",
    ...new Set(tasks.map((task) => task.status)),
  ];

  const filteredTasks = useMemo(() => {

    const value = search.toLowerCase();

    return tasks.filter((task) => {

      const matchesSearch =
        task.project.toLowerCase().includes(value) ||
        task.description.toLowerCase().includes(value) ||
        task.phase.toLowerCase().includes(value) ||
        task.manager.toLowerCase().includes(value) ||
        task.status.toLowerCase().includes(value);

      const matchesManager =
        managerFilter === "Todos" ||
        task.manager === managerFilter;

      const matchesProject =
        projectFilter === "Todos los proyectos" ||
        task.project === projectFilter;

      const matchesTeam =
        teamFilter === "Todos" ||
        task.support.includes(teamFilter);

      const matchesStatus =
        statusFilter === "Todos" ||
        task.status === statusFilter;

      const matchesDeliveryDate =
        !deliveryDateFilter ||
        (task.deliveryDate || "") === deliveryDateFilter;

      const matchesArchive = archiveView === "archivadas"
        ? task.archived
        : !task.archived;

      return (
        matchesSearch &&
        matchesManager &&
        matchesProject &&
        matchesTeam &&
        matchesStatus &&
        matchesDeliveryDate &&
        matchesArchive
      );

    });

  }, [
    tasks,
    search,
    managerFilter,
    projectFilter,
    teamFilter,
    statusFilter,
    deliveryDateFilter,
    archiveView,
  ]);

  const groupedTasks = useMemo(() => {
    const groups = filteredTasks.reduce<Record<string, Task[]>>((acc, task) => {
      const key = task.project || "Sin proyecto";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(task);
      return acc;
    }, {});

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTasks]);

  const activitiesExportColumns = useMemo<Array<ExportColumn<Task>>>(() => {
    return [
      {
        key: "project",
        header: "Proyecto",
        getValue: (row) => row.project,
      },
      {
        key: "phase",
        header: "Fase",
        getValue: (row) => row.phase,
      },
      {
        key: "description",
        header: "Actividad",
        getValue: (row) => row.description,
      },
      {
        key: "manager",
        header: "Responsable",
        getValue: (row) => row.manager || "Sin responsable",
      },
      {
        key: "reviewDate",
        header: "Proxima revision",
        isDate: true,
        getValue: (row) => row.reviewDate || "",
      },
      {
        key: "deliveryDate",
        header: "Fecha de entrega",
        isDate: true,
        getValue: (row) => row.deliveryDate || "",
      },
      {
        key: "status",
        header: "Estatus",
        getValue: (row) => row.status,
      },
    ];
  }, []);

  const exportActivities = async (format: "xlsx" | "pdf") => {
    const { settings } = loadGeneralSettings();

    await exportTableData({
      moduleName: `Actividades ${workflow}`,
      fileName: `actividades-${workflow.toLowerCase()}-${buildTimestampLabel()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: activitiesExportColumns,
      rows: filteredTasks,
      landscape: true,
    });
  };

  const getNextTaskId = () => {
    return tasks.reduce((maxId, task) => Math.max(maxId, task.id), 0) + 1;
  };

  const addQuickTaskToProject = (project: string) => {
    const nextTask = createTaskFromValues(
      {
        project,
        phase: phaseOptions[0] ?? "Inicial",
        description: "Nueva tarea",
        manager: availableTeamMembers[0],
        status: "Pendiente",
        notes: "",
        commitmentDate: "",
        reviewDate: "",
      },
      getNextTaskId(),
      workflow
    );

    setTasks((current) => [...current, nextTask]);
  };

  const addProjectTemplateTasks = (
    project: string,
    items: Array<{ phase: string; description: string }>
  ) => {
    const startId = getNextTaskId();

    const nextTasks = items.map((item, index) =>
      createTaskFromValues(
        {
          project,
          phase: item.phase,
          description: item.description,
          manager: availableTeamMembers[0],
          status: "Pendiente",
          notes: "",
          commitmentDate: "",
          reviewDate: "",
        },
        startId + index,
        workflow
      )
    );

    setTasks((current) => [...current, ...nextTasks]);
    setArchiveView("activos");
  };

  const clearFilters = () => {
    setSearch("");
    updateProjectFilter("Todos los proyectos");
    setManagerFilter("Todos");
    setTeamFilter("Todos");
    setStatusFilter("Todos");
    setDeliveryDateFilter("");
    setArchiveView("activos");
  };

  const stageNavigation = useMemo(() => {
    const query = searchParams.toString();

    return [
      {
        label: "Presale",
        href: query ? `/tareas/presale?${query}` : "/tareas/presale",
        isActive: workflow === "Presale",
      },
      {
        label: "Taller de Diseño",
        href: query ? `/tareas/diseno?${query}` : "/tareas/diseno",
        isActive: workflow === "Diseño",
      },
      {
        label: "Construcción",
        href: query ? `/tareas/construccion?${query}` : "/tareas/construccion",
        isActive: workflow === "Construcción",
      },
    ];
  }, [searchParams, workflow]);

  return (

    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">

      <div className="p-6 border-b border-slate-200">

        <div className="mb-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {stageNavigation.map((stage) => (
            <Link
              key={stage.label}
              href={stage.href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${stage.isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-800 hover:bg-white hover:text-slate-900"}`}
            >
              {stage.label}
            </Link>
          ))}
        </div>

        <div className="flex justify-between items-center">

          <div>

            <h1 className="text-3xl font-bold text-slate-900">
              {title}
            </h1>

            <p className="mt-1 text-slate-700">
              {subtitle}
            </p>

          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowProjectTemplateModal(true)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Iniciar plantilla de {templateName}
            </button>

            <button
              type="button"
              onClick={() => setShowNewTask(true)}
              className="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              + Nueva tarea
            </button>
          </div>

        </div>

      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-6">

        <input
          type="text"
          placeholder="Buscar tarea..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-64 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 placeholder:text-slate-500"
        />

        <select
          value={projectFilter}
          onChange={(e) => updateProjectFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
        >
          <option value="Todos los proyectos">Proyecto</option>
          {projects
            .filter((project) => project !== "Todos los proyectos")
            .map((project, index) => (
              <option key={`project-option-${index}-${project}`} value={project}>
                {project}
              </option>
            ))}
        </select>

        <select
          value={managerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
        >
          <option value="Todos">Responsable</option>
          {managers
            .filter((manager) => manager !== "Todos")
            .map((manager) => (
              <option key={manager} value={manager}>
                {manager}
              </option>
            ))}
        </select>

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
        >
          <option value="Todos">Equipo</option>
          {teams
            .filter((team) => team !== "Todos")
            .map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
        >
          <option value="Todos">Estatus</option>
          {statuses
            .filter((status) => status !== "Todos")
            .map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
        </select>

        <input
          type="date"
          value={deliveryDateFilter}
          onChange={(e) => setDeliveryDateFilter(e.target.value)}
          aria-label="Filtrar por fecha entrega"
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
        />

        <div className="flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setArchiveView("activos");
            }}
            className={`rounded-md px-2.5 py-1.5 text-sm ${archiveView === "activos" ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            Activas
          </button>
          <button
            type="button"
            onClick={() => {
              setArchiveView("archivadas");
            }}
            className={`rounded-md px-2.5 py-1.5 text-sm ${archiveView === "archivadas" ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            Archivadas
          </button>
        </div>

        <button
          type="button"
          onClick={clearFilters}
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Limpiar filtros
        </button>

        {activitiesCapabilities.canExportData ? (
          <ExportMenu onExport={exportActivities} scaleClassName="scale-100" />
        ) : null}

      </div>

      <div className="overflow-x-auto">
        {groupedTasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-800">
            No hay tareas que coincidan con los filtros actuales.
          </div>
        ) : (
          groupedTasks.map(([project, projectTasks], index) => {
            const tone = PROJECT_TONES[index % PROJECT_TONES.length];

            return (
            <GroupSection
              key={project}
              title={project}
              count={projectTasks.length}
              archivedCount={projectTasks.filter((task) => task.archived).length}
              headerClassName={`${tone.headerClassName} rounded-t-xl border border-slate-200 border-b-0`}
              titleClassName={`${tone.titleClassName} inline-flex rounded-lg px-3 py-1`}
            >
              <div className="overflow-x-auto rounded-b-xl border border-slate-200">
                <table className="w-full min-w-[1800px] text-black">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left text-sm text-black">
                    <th className="px-4 py-3 w-[7%]">Proyecto</th>
                    <th className="px-4 py-3 w-[6%]">Fase</th>
                    <th className="px-4 py-3 w-[23%]">Descripción</th>
                    <th className="px-4 py-3 w-[14%]">Seguimiento</th>
                    <th className="px-4 py-3 w-[12%]">Responsable</th>
                    <th className="px-4 py-3 w-[12%]">Equipo</th>
                    <th className="px-4 py-3 w-[11%] min-w-[150px] whitespace-nowrap">Estatus</th>
                    <th className="px-4 py-3 w-[12%] min-w-[165px]">
                      <span className="block leading-none">Compromiso</span>
                      <span className="mt-1 block text-[11px] font-medium normal-case text-slate-600">(no mover fecha)</span>
                    </th>
                    <th className="px-4 py-3 w-[13%] min-w-[180px] whitespace-nowrap">Próxima revisión</th>
                    <th className="px-4 py-3 w-[12%] min-w-[165px] whitespace-nowrap">Fecha entrega</th>
                    <th className="px-4 py-3">Fecha actualizada</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                    {projectTasks.map((task) => (
                      <PresaleRow
                        key={task.id}
                        task={task}
                        phaseOptions={phaseOptions}
                        teamMembers={availableTeamMembers}
                        canChangeResponsible={activitiesCapabilities.canChangeResponsible}
                        canReorderPhases={activitiesCapabilities.canReorderPhases}
                        canDeleteActivity={activitiesCapabilities.canDeleteActivity}
                        canChangeStatus={canChangeActivityStatus({
                          capabilities: activitiesCapabilities,
                          task,
                          viewerName,
                        })}
                        onSave={(updatedTask) => {
                          setTasks((current) =>
                            current.map((currentTask) =>
                              currentTask.id === updatedTask.id ? updatedTask : currentTask
                            )
                          );
                        }}
                        onOpenDetail={(nextTask) => setSelectedTask(nextTask)}
                        onDelete={(taskId) => {
                          setTasks((current) => current.filter((currentTask) => currentTask.id !== taskId));

                          setSelectedTask((current) => {
                            if (!current) {
                              return null;
                            }

                            return current.id === taskId ? null : current;
                          });
                        }}
                        availableProjects={activeProjects}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 pb-4 pt-2">
                <button
                  type="button"
                  onClick={() => addQuickTaskToProject(project)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-black hover:bg-slate-50"
                >
                  + Agregar fila
                </button>
              </div>
            </GroupSection>
          );})
        )}
      </div>

      <TaskDrawer
        key={selectedTask?.id ?? "none"}
        task={selectedTask}
        teamMembers={availableTeamMembers}
        onClose={() => setSelectedTask(null)}
        onSave={(updatedTask) => {
          const nextTask: Task = {
            ...updatedTask,
            updatedAt: "Hoy",
          };

          setTasks((current) =>
            current.map((task) =>
              task.id === nextTask.id ? nextTask : task
            )
          );

          setSelectedTask(nextTask);
        }}
      />

      <NewTaskModal
        key={showNewTask ? "new-task-open" : "new-task-closed"}
        open={showNewTask}
        projects={activeProjects}
        teamMembers={availableTeamMembers}
        phaseOptions={phaseOptions}
        onClose={() => setShowNewTask(false)}
        onSave={(task: TaskFormValues) => {
          const newTask = createTaskFromValues(task, tasks.length + 1, workflow);

          setTasks((current) => [...current, newTask]);
          setShowNewTask(false);
        }}
      />

      <NewProjectTemplateModal
        key={showProjectTemplateModal ? "project-template-open" : "project-template-closed"}
        open={showProjectTemplateModal}
        templateItems={templateItems}
        projectOptions={activeProjectsForTemplate}
        onClose={() => setShowProjectTemplateModal(false)}
        onCreate={({ project, items }) => {
          addProjectTemplateTasks(project, items);
          setShowProjectTemplateModal(false);
        }}
      />

    </div>

  );

}