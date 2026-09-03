"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import type { Task, TaskStatus, TaskHistoryItem, WorkflowType } from "@/lib/types/task";
import { presaleTasks } from "@/lib/data/presale";

import { buildPresaleColumns } from "./PresaleRow";
import TaskDrawer from "./TaskDrawer";
import NewTaskModal from "./NewTaskModal";
import NewProjectTemplateModal from "./NewProjectTemplateModal";
import GroupSection from "@/components/ui/GroupSection";
import ExportMenu from "@/components/ui/ExportMenu";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { presaleTemplate } from "@/lib/templates/presale";
import { presalePhaseOptions } from "@/lib/templates/phase-options";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { projects as baseProjects } from "@/lib/data/projects";
import { getProjectsSnapshot } from "@/lib/repositories/projects-repository";
import { fetchActivities, saveActivities } from "@/lib/repositories/activities-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";

type TaskFormValues = {
  project: string;
  phase: string;
  description: string;
  manager: string;
  support: string[];
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
    support: values.support,
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

  const columns = useMemo(
    () =>
      buildPresaleColumns({
        phaseOptions,
        teamMembers: availableTeamMembers,
        availableProjects: activeProjects,
        canChangeResponsible: activitiesCapabilities.canChangeResponsible,
        canReorderPhases: activitiesCapabilities.canReorderPhases,
        canDeleteActivity: activitiesCapabilities.canDeleteActivity,
        getCanChangeStatus: (task) =>
          canChangeActivityStatus({ capabilities: activitiesCapabilities, task, viewerName }),
        onSave: (updatedTask) => {
          setTasks((current) =>
            current.map((currentTask) =>
              currentTask.id === updatedTask.id ? updatedTask : currentTask
            )
          );
        },
        onOpenDetail: (nextTask) => setSelectedTask(nextTask),
        onDelete: (taskId) => {
          setTasks((current) => current.filter((currentTask) => currentTask.id !== taskId));

          setSelectedTask((current) => {
            if (!current) {
              return null;
            }

            return current.id === taskId ? null : current;
          });
        },
      }),
    [phaseOptions, activeProjects, activitiesCapabilities, viewerName]
  );

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
        support: [],
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
          support: [],
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
            <Button variant="outline" onClick={() => setShowProjectTemplateModal(true)}>
              Iniciar plantilla de {templateName}
            </Button>

            <Button onClick={() => setShowNewTask(true)}>
              + Nueva tarea
            </Button>
          </div>

        </div>

      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-6">

        <Input
          type="text"
          placeholder="Buscar tarea..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-64"
        />

        <Select value={projectFilter} onValueChange={(v) => updateProjectFilter(v as string)}>
          <SelectTrigger className="h-10 w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos los proyectos">Proyecto</SelectItem>
            {projects
              .filter((project) => project !== "Todos los proyectos")
              .map((project, index) => (
                <SelectItem key={`project-option-${index}-${project}`} value={project}>
                  {project}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select value={managerFilter} onValueChange={(v) => setManagerFilter(v as string)}>
          <SelectTrigger className="h-10 w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Responsable</SelectItem>
            {managers
              .filter((manager) => manager !== "Todos")
              .map((manager) => (
                <SelectItem key={manager} value={manager}>
                  {manager}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v as string)}>
          <SelectTrigger className="h-10 w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Equipo</SelectItem>
            {teams
              .filter((team) => team !== "Todos")
              .map((team) => (
                <SelectItem key={team} value={team}>
                  {team}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as string)}>
          <SelectTrigger className="h-10 w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Estatus</SelectItem>
            {statuses
              .filter((status) => status !== "Todos")
              .map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={deliveryDateFilter}
          onChange={(e) => setDeliveryDateFilter(e.target.value)}
          aria-label="Filtrar por fecha entrega"
          className="h-10 w-auto"
        />

        <div className="flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-2 text-sm">
          <Button
            variant="ghost"
            onClick={() => setArchiveView("activos")}
            className={`h-auto rounded-md px-2.5 py-1.5 text-sm ${archiveView === "activos" ? "bg-blue-600 text-white hover:bg-blue-600" : "text-slate-700"}`}
          >
            Activas
          </Button>
          <Button
            variant="ghost"
            onClick={() => setArchiveView("archivadas")}
            className={`h-auto rounded-md px-2.5 py-1.5 text-sm ${archiveView === "archivadas" ? "bg-slate-800 text-white hover:bg-slate-800" : "text-slate-700"}`}
          >
            Archivadas
          </Button>
        </div>

        <Button variant="outline" onClick={clearFilters} className="h-10">
          Limpiar filtros
        </Button>

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
              <DataTable
                columns={columns}
                data={projectTasks}
                getRowId={(task) => String(task.id)}
                rowClassName={(task) => (task.archived ? "bg-slate-50 opacity-80" : undefined)}
                tableClassName="min-w-[1800px] text-black"
              />

              <div className="px-4 pb-4 pt-2">
                <Button
                  variant="outline"
                  onClick={() => addQuickTaskToProject(project)}
                  className="text-black"
                >
                  + Agregar fila
                </Button>
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