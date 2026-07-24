"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { projects } from "@/lib/data/projects";
import { teamMembers } from "@/lib/data/team";
import type { Task } from "@/lib/types/task";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";

type RiskLevel = "Alto" | "Medio" | "Bajo";

type ProjectNote = {
  id: string;
  projectId: number;
  content: string;
  createdAt: string;
};

type ProjectItem = (typeof projects)[number];
type NewProjectDraft = {
  name: string;
  clientId: string;
  type: string;
  stages: string[];
  coordinator: string;
  docsUrl: string;
  startDate: string;
};

const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";
const MANUAL_CLIENTS_STORAGE_KEY = "cincel.clients.manual.v1";
const SECONDARY_COORDINATOR_STORAGE_KEY = "cincel.projects.secondary-coordinator.v1";
const STAGE_OPTIONS = ["Presale", "Diseño", "Construcción"];
const emptyNewProjectDraft: NewProjectDraft = {
  name: "",
  clientId: "",
  type: "Habitacional",
  stages: ["Presale"],
  coordinator: "Sin responsable",
  docsUrl: "",
  startDate: "",
};

type ActiveClientOption = {
  id: number;
  name: string;
  kind: "Empresa" | "Particular";
};

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function loadPersistedTasks(workflow: string, fallback: Task[]): Task[] {
  if (workflow === "Presale" || workflow === "Diseño" || workflow === "Construcción") {
    return loadLinkedTasks(workflow, fallback);
  }

  return fallback;
}

function projectStatusSelectClasses(active: boolean): string {
  if (active) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  return "border-red-200 bg-red-50 text-red-800";
}

function projectStatusDotClasses(active: boolean): string {
  return active ? "bg-emerald-500" : "bg-red-500";
}

function parseDate(input: string): Date | null {
  if (!input) return null;
  // For date-only strings (YYYY-MM-DD), parse as local date to avoid UTC timezone offset issues
  const dateOnlyMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch.map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(input: string): string {
  const parsed = parseDate(input);
  if (!parsed) return "Sin fecha";
  return parsed.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function projectTasksPath(projectName: string): string {
  return `/tareas?project=${encodeURIComponent(projectName)}`;
}

function loadProjectNotes(): Record<number, ProjectNote[]> {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = localStorage.getItem("cincel.projects.notes.v1");

  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<number, ProjectNote[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localStorage.removeItem("cincel.projects.notes.v1");
    return {};
  }
}

function loadPersistedProjects(): ProjectItem[] {
  if (typeof window === "undefined") {
    return projects;
  }

  const stored = localStorage.getItem("cincel.projects.data.v1");

  if (!stored) {
    return projects;
  }

  try {
    const parsed = JSON.parse(stored) as Array<Partial<ProjectItem>>;

    if (!Array.isArray(parsed)) {
      return projects;
    }

    const normalized = parsed
      .map((item) => {
        const fallback = projects.find(
          (project) => project.code === item.code || project.name === item.name
        );

        if (!fallback) {
          const rawId = item.id;
          const numericId = typeof rawId === "number"
            ? rawId
            : typeof rawId === "string"
              ? Number(rawId)
              : Number.NaN;
          const safeId = Number.isFinite(numericId) ? numericId : Date.now();
          const incomingClient = item.client as Partial<ProjectItem["client"]> | undefined;
          const safeCoordinator = normalizeName(item.coordinator) || "Sin responsable";

          return {
            id: safeId,
            code: typeof item.code === "string" && item.code ? item.code : `PRJ-${safeId}`,
            name: typeof item.name === "string" && item.name ? item.name : `Proyecto ${safeId}`,
            active: Boolean(item.active),
            status: typeof item.status === "string" && item.status ? item.status : (item.active ? "Activo" : "Inactivo"),
            client: {
              id: typeof incomingClient?.id === "number" ? incomingClient.id : safeId,
              name: normalizeName(incomingClient?.name) || "Cliente",
              emails: Array.isArray(incomingClient?.emails)
                ? incomingClient.emails.filter((email): email is string => typeof email === "string" && email.trim().length > 0)
                : [],
              phone: normalizeName(incomingClient?.phone) || "",
              kind: incomingClient?.kind === "Empresa" || incomingClient?.kind === "Particular"
                ? incomingClient.kind
                : "Particular",
              contacts: Array.isArray(incomingClient?.contacts)
                ? incomingClient.contacts.filter((contact): contact is { name: string; role: string; phone: string; email: string } =>
                  Boolean(contact)
                  && typeof contact.name === "string"
                  && typeof contact.role === "string"
                  && typeof contact.phone === "string"
                  && typeof contact.email === "string"
                )
                : [],
              completedProjects: Array.isArray(incomingClient?.completedProjects)
                ? incomingClient.completedProjects.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                : [],
              acquisitionChannel: typeof incomingClient?.acquisitionChannel === "string"
                ? incomingClient.acquisitionChannel
                : "Sin registro",
              totalSpent: typeof incomingClient?.totalSpent === "number" ? incomingClient.totalSpent : 0,
            },
            type: typeof item.type === "string" && item.type ? item.type : "Otro",
            stage: typeof item.stage === "string" && item.stage ? item.stage : "Presale",
            phase: typeof item.phase === "string" && item.phase ? item.phase : "Inicial",
            address: {
              street: item.address && typeof item.address.street === "string" ? item.address.street : "",
              city: item.address && typeof item.address.city === "string" ? item.address.city : "",
              state: item.address && typeof item.address.state === "string" ? item.address.state : "",
            },
            manager: normalizeName(item.manager) || "Sin responsable",
            coordinator: safeCoordinator,
            team: Array.isArray(item.team) ? item.team.filter((member): member is string => typeof member === "string") : [],
            progress: typeof item.progress === "number" ? item.progress : 0,
            drive: {
              administrativo: item.drive && typeof item.drive.administrativo === "string" ? item.drive.administrativo : "",
              planos: item.drive && typeof item.drive.planos === "string" ? item.drive.planos : "",
              renders: item.drive && typeof item.drive.renders === "string" ? item.drive.renders : "",
              reportes: item.drive && typeof item.drive.reportes === "string" ? item.drive.reportes : "",
            },
            startDate: typeof item.startDate === "string" ? item.startDate : "",
          } as ProjectItem;
        }

        const rawId = item.id;
        const numericId = typeof rawId === "number"
          ? rawId
          : typeof rawId === "string"
            ? Number(rawId)
            : Number.NaN;

        const safeId = Number.isFinite(numericId) ? numericId : fallback.id;
        const safeCoordinator = normalizeName(item.coordinator) || fallback.coordinator || "Sin responsable";
        const incomingClient = item.client as Partial<ProjectItem["client"]> | undefined;

        const safeClient = {
          ...fallback.client,
          ...incomingClient,
          emails: Array.isArray(incomingClient?.emails)
            ? incomingClient.emails.filter((email): email is string => typeof email === "string" && email.trim().length > 0)
            : fallback.client.emails,
          phone: normalizeName(incomingClient?.phone) || fallback.client.phone || "",
          kind: incomingClient?.kind === "Empresa" || incomingClient?.kind === "Particular"
            ? incomingClient.kind
            : fallback.client.kind,
          contacts: Array.isArray(incomingClient?.contacts)
            ? incomingClient.contacts.filter((contact): contact is { name: string; role: string; phone: string; email: string } =>
              Boolean(contact)
              && typeof contact.name === "string"
              && typeof contact.role === "string"
              && typeof contact.phone === "string"
              && typeof contact.email === "string"
            )
            : Array.isArray(fallback.client.contacts)
              ? fallback.client.contacts
              : [],
          completedProjects: Array.isArray(incomingClient?.completedProjects)
            ? incomingClient.completedProjects.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : Array.isArray(fallback.client.completedProjects)
              ? fallback.client.completedProjects
              : [],
          acquisitionChannel: typeof incomingClient?.acquisitionChannel === "string"
            ? incomingClient.acquisitionChannel
            : fallback.client.acquisitionChannel,
          totalSpent: typeof incomingClient?.totalSpent === "number"
            ? incomingClient.totalSpent
            : fallback.client.totalSpent,
        };

        return {
          ...fallback,
          ...item,
          id: safeId,
          coordinator: safeCoordinator,
          client: safeClient,
        } as ProjectItem;
      })
      .filter((item): item is ProjectItem => item !== null);

    return normalized.length > 0 ? normalized : projects;
  } catch {
    localStorage.removeItem("cincel.projects.data.v1");
    return projects;
  }
}

function loadActiveTeamNames(): string[] {
  if (typeof window === "undefined") {
    return teamMembers.filter((member) => member.active).map((member) => member.name);
  }

  const stored = localStorage.getItem(TEAM_MEMBERS_STORAGE_KEY);

  if (!stored) {
    return teamMembers.filter((member) => member.active).map((member) => member.name);
  }

  try {
    const parsed = JSON.parse(stored) as Array<{ name?: unknown; active?: boolean }>;

    if (!Array.isArray(parsed)) {
      return teamMembers.filter((member) => member.active).map((member) => member.name);
    }

    return parsed
      .filter((member) => member.active)
      .map((member) => normalizeName(member.name))
      .filter((name): name is string => name !== null);
  } catch {
    return teamMembers.filter((member) => member.active).map((member) => member.name);
  }
}

function loadSecondaryCoordinatorMap(): Record<number, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = localStorage.getItem(SECONDARY_COORDINATOR_STORAGE_KEY);

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

export default function ProjectsTable() {
  const router = useRouter();
  const [projectsData, setProjectsData] = useState<ProjectItem[]>(() => loadPersistedProjects());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [activeTeamNames, setActiveTeamNames] = useState<string[]>(() => loadActiveTeamNames());
  const [secondaryCoordinatorByProject, setSecondaryCoordinatorByProject] = useState<Record<number, string>>(() => loadSecondaryCoordinatorMap());
  const [statusViewFilter, setStatusViewFilter] = useState<"Activos" | "Archivados">("Activos");
  const [search, setSearch] = useState("");
  const [coordinatorFilter, setCoordinatorFilter] = useState("Todos");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "Todos">("Todos");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newProjectDraft, setNewProjectDraft] = useState<NewProjectDraft>(emptyNewProjectDraft);
  const [notesByProject, setNotesByProject] = useState<Record<number, ProjectNote[]>>(() => loadProjectNotes());
  const [activeNoteProjectId, setActiveNoteProjectId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [inlineEditingCell, setInlineEditingCell] = useState<{ projectId: number; field: "design" | "construction" } | null>(null);

  useEffect(() => {
    localStorage.setItem("cincel.projects.data.v1", JSON.stringify(projectsData));
  }, [projectsData]);

  useEffect(() => {
    localStorage.setItem(SECONDARY_COORDINATOR_STORAGE_KEY, JSON.stringify(secondaryCoordinatorByProject));
  }, [secondaryCoordinatorByProject]);

  useEffect(() => {
    const refreshTeam = () => {
      setActiveTeamNames(loadActiveTeamNames());
      setAuthenticatedUser(getCurrentAuthenticatedUser());
    };

    window.addEventListener("focus", refreshTeam);
    window.addEventListener("storage", refreshTeam);

    return () => {
      window.removeEventListener("focus", refreshTeam);
      window.removeEventListener("storage", refreshTeam);
    };
  }, []);

  const projectsCapabilities = useMemo(() => {
    return resolveProjectsCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  const allTasks = useMemo(() => {
    return [
      ...loadPersistedTasks("Presale", presaleTasks),
      ...loadPersistedTasks("Diseño", disenoTasks),
      ...loadPersistedTasks("Construcción", operativasTasks),
    ];
  }, []);

  const enrichedProjects = useMemo(() => {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    return projectsData.map((project) => {
      const projectTasks = allTasks.filter((task) => task.project === project.name && !task.archived);
      const activeTasks = projectTasks.filter((task) => task.status !== "Completado");
      const blockedCount = activeTasks.filter((task) => task.status === "Bloqueado").length;

      const dueDates = activeTasks
        .map((task) => task.commitmentDate)
        .filter(Boolean)
        .map((date) => parseDate(date))
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      const nextDelivery = dueDates.length > 0 ? dueDates[0] : null;
      const dueThisWeek = dueDates.filter((date) => date >= today && date <= nextWeek).length;
      const overdueCount = dueDates.filter((date) => date < today).length;

      const teamLoad = Math.min(
        100,
        Math.round((activeTasks.length / Math.max(project.team.length * 3, 1)) * 100)
      );

      const risk: RiskLevel = blockedCount > 0 || overdueCount > 0 || project.progress < 45
        ? "Alto"
        : dueThisWeek > 0 || project.progress < 75
          ? "Medio"
          : "Bajo";

      const mainAlert = blockedCount > 0
        ? `${blockedCount} tarea(s) bloqueada(s)`
        : overdueCount > 0
          ? `${overdueCount} entrega(s) vencida(s)`
          : dueThisWeek > 0
            ? `${dueThisWeek} entrega(s) esta semana`
            : "Sin alertas criticas";

      return {
        ...project,
        blockedCount,
        dueThisWeek,
        overdueCount,
        activeTaskCount: activeTasks.length,
        nextDelivery,
        teamLoad,
        risk,
        mainAlert,
      };
    });
  }, [allTasks, projectsData]);

  const coordinators = [
    "Todos",
    ...Array.from(
      new Set(
        projectsData
          .map((project) => normalizeName(project.coordinator) || "Sin encargado")
      )
    ),
  ];

  const filteredProjects = enrichedProjects.filter((project) => {
    const value = search.trim().toLowerCase();

    const matchesSearch = !value
      || project.name.toLowerCase().includes(value);

    const projectCoordinator = normalizeName(project.coordinator) || "Sin encargado";
    const matchesCoordinator = coordinatorFilter === "Todos" || projectCoordinator === coordinatorFilter;
    const matchesRisk = riskFilter === "Todos" || project.risk === riskFilter;

    return matchesSearch && matchesCoordinator && matchesRisk;
  });

  const visibleProjects = filteredProjects.filter((project) => {
    if (statusViewFilter === "Activos") {
      return project.active;
    }

    return !project.active;
  });

  const kpiActiveProjects = visibleProjects.filter((project) => project.active).length;

  const stageStats = visibleProjects.reduce<Record<string, number>>((acc, project) => {
    const stages = project.stage
      .split("/")
      .map((stage) => stage.trim())
      .filter(Boolean);

    for (const stage of stages) {
      acc[stage] = (acc[stage] ?? 0) + 1;
    }

    return acc;
  }, {});

  const orderedStageStats = Object.entries(stageStats)
    .sort((a, b) => b[1] - a[1]);

  const totalStageAssignments = orderedStageStats.reduce((acc, [, count]) => acc + count, 0);

  const coordinatorStats = visibleProjects.reduce<Record<string, { design: number; construction: number; total: number }>>((acc, project) => {
    const designer = normalizeName(project.coordinator) || "Sin encargado";
    const constructor = normalizeName(secondaryCoordinatorByProject[project.id]) || "Sin encargado";

    if (!acc[designer]) acc[designer] = { design: 0, construction: 0, total: 0 };
    acc[designer].design += 1;
    acc[designer].total += 1;

    if (constructor !== designer) {
      if (!acc[constructor]) acc[constructor] = { design: 0, construction: 0, total: 0 };
      acc[constructor].construction += 1;
      acc[constructor].total += 1;
    } else {
      acc[designer].construction += 1;
    }

    return acc;
  }, {});

  const orderedCoordinatorStats = Object.entries(coordinatorStats)
    .sort((a, b) => b[1].total - a[1].total);

  const alerts = visibleProjects
    .filter((project) => project.mainAlert !== "Sin alertas criticas")
    .slice(0, 6);

  const activeClientOptions = useMemo<ActiveClientOption[]>(() => {
    const fromProjects: ActiveClientOption[] = projectsData
      .filter((project) => project.active)
      .map((project) => {
        const kind: "Empresa" | "Particular" = project.client.kind === "Empresa" ? "Empresa" : "Particular";
        return {
          id: project.client.id,
          name: project.client.name,
          kind,
        };
      });

    const fromManual = (() => {
      if (typeof window === "undefined") {
        return [] as ActiveClientOption[];
      }

      const stored = localStorage.getItem(MANUAL_CLIENTS_STORAGE_KEY);

      if (!stored) {
        return [] as ActiveClientOption[];
      }

      try {
        const parsed = JSON.parse(stored) as Array<{
          id?: unknown;
          name?: unknown;
          kind?: unknown;
          hasActiveProject?: unknown;
        }>;

        if (!Array.isArray(parsed)) {
          return [] as ActiveClientOption[];
        }

        return parsed
          .filter((item) => Boolean(item.hasActiveProject))
          .map((item) => {
            const id = typeof item.id === "number" ? item.id : Number(item.id);
            const name = typeof item.name === "string" ? item.name.trim() : "";

            if (!Number.isFinite(id) || !name) {
              return null;
            }

            return {
              id,
              name,
              kind: item.kind === "Empresa" ? "Empresa" : "Particular",
            };
          })
          .filter((item): item is ActiveClientOption => item !== null);
      } catch {
        return [] as ActiveClientOption[];
      }
    })();

    const deduped = new Map<string, ActiveClientOption>();

    for (const client of [...fromProjects, ...fromManual]) {
      const key = client.name.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, client);
      }
    }

    return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projectsData]);

  const projectTypeOptions = ["Habitacional", "Oficinas", "Comercial", "Mobiliario", "Mantenimiento", "Otro"];

  const activeNoteProject = activeNoteProjectId === null
    ? null
    : projectsData.find((project) => project.id === activeNoteProjectId) ?? null;

  const activeNotes = activeNoteProjectId === null
    ? []
    : notesByProject[activeNoteProjectId] ?? [];

  const openNotesModal = (projectId: number) => {
    setActiveNoteProjectId(projectId);
    setNoteDraft("");
  };

  const closeNotesModal = () => {
    setActiveNoteProjectId(null);
    setNoteDraft("");
  };

  const openCreateModal = () => {
    if (!projectsCapabilities.canCreateProject) {
      return;
    }

    setCreateError("");
    setNewProjectDraft({
      ...emptyNewProjectDraft,
      type: projectTypeOptions[0] ?? "Habitacional",
      clientId: "",
      coordinator: activeTeamNames[0] ?? "Sin responsable",
    });
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateError("");
  };

  const createProject = () => {
    if (!projectsCapabilities.canCreateProject) {
      return;
    }

    const projectName = newProjectDraft.name.trim();
    const selectedClient = activeClientOptions.find((client) => String(client.id) === newProjectDraft.clientId);

    const nextProjectId = Math.max(0, ...projectsData.map((project) => project.id)) + 1;
    const nextClientId = Math.max(0, ...projectsData.map((project) => project.client.id)) + 1;
    const safeProjectName = projectName || `Proyecto ${nextProjectId}`;
    const stageLabel = newProjectDraft.stages.length > 0 ? newProjectDraft.stages.join(" / ") : "Sin etapa";

    const createdProject: ProjectItem = {
      id: nextProjectId,
      code: `PRJ-${String(nextProjectId).padStart(3, "0")}`,
      name: safeProjectName,
      active: true,
      status: "Activo",
      client: {
        id: selectedClient?.id ?? nextClientId,
        name: selectedClient?.name ?? "Sin cliente vinculado",
        emails: [],
        phone: "",
        kind: selectedClient?.kind ?? "Particular",
        contacts: [],
        completedProjects: [],
        acquisitionChannel: "Sin registro",
        totalSpent: 0,
      },
      type: newProjectDraft.type || "Otro",
      stage: stageLabel,
      phase: "Inicial",
      address: {
        street: "",
        city: "",
        state: "",
      },
      manager: "Sin responsable",
      coordinator: newProjectDraft.coordinator || "Sin responsable",
      team: [],
      progress: 0,
      drive: {
        administrativo: newProjectDraft.docsUrl.trim(),
        planos: "",
        renders: "",
        reportes: "",
      },
      startDate: newProjectDraft.startDate || new Date().toISOString().split("T")[0],
    };

    const nextProjects = [createdProject, ...projectsData];
    setProjectsData(nextProjects);
    localStorage.setItem("cincel.projects.data.v1", JSON.stringify(nextProjects));
    setShowCreateModal(false);
    setCreateError("");
    router.push(`/proyectos/${createdProject.id}/ficha`);
  };

  const saveNote = () => {
    const content = noteDraft.trim();

    if (!content || activeNoteProjectId === null) {
      return;
    }

    const newNote: ProjectNote = {
      id: `${activeNoteProjectId}-${Date.now()}`,
      projectId: activeNoteProjectId,
      content,
      createdAt: new Date().toISOString(),
    };

    const next = {
      ...notesByProject,
      [activeNoteProjectId]: [newNote, ...(notesByProject[activeNoteProjectId] ?? [])],
    };

    setNotesByProject(next);
    localStorage.setItem("cincel.projects.notes.v1", JSON.stringify(next));
    setNoteDraft("");
  };

  const updateCoordinator = (projectId: number, coordinator: string) => {
    if (!projectsCapabilities.canEditProjectGeneral) {
      return;
    }

    setProjectsData((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              coordinator,
            }
          : project
      )
    );
  };

  const updateProjectActive = (projectId: number, active: boolean) => {
    if (!projectsCapabilities.canArchiveProject) {
      return;
    }

    setProjectsData((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              active,
              status: active ? "Activo" : "Archivado",
            }
          : project
      )
    );
  };

  const deleteProject = (projectId: number) => {
    if (!projectsCapabilities.canDeleteProject) {
      return;
    }

    const project = projectsData.find((item) => item.id === projectId);

    if (!project) {
      return;
    }

    const confirmed = window.confirm(
      `Se eliminara el proyecto "${project.name}". Esta accion no se puede deshacer. Deseas continuar?`
    );

    if (!confirmed) {
      return;
    }

    setProjectsData((current) => current.filter((item) => item.id !== projectId));

    setNotesByProject((current) => {
      const next = { ...current };
      delete next[projectId];
      localStorage.setItem("cincel.projects.notes.v1", JSON.stringify(next));
      return next;
    });

    if (activeNoteProjectId === projectId) {
      setActiveNoteProjectId(null);
      setNoteDraft("");
    }
  };

  const getCoordinatorOptions = (project: ProjectItem): string[] => {
    const options = [
      ...activeTeamNames.map((name) => normalizeName(name)),
      normalizeName(project.coordinator),
    ].filter((name): name is string => name !== null);

    return Array.from(new Set(options)).sort((a, b) => a.localeCompare(b));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Proyectos</h2>
            <p className="mt-1 text-slate-600">Vista operativa para riesgo, entregas y carga por proyecto.</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={openCreateModal}
              disabled={!projectsCapabilities.canCreateProject}
              title={projectsCapabilities.canCreateProject ? "" : "No tienes permiso para crear proyectos"}
              className={`rounded-xl px-5 py-2 text-sm font-medium text-white ${projectsCapabilities.canCreateProject ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-300"}`}
            >
              + Nuevo proyecto
            </button>

            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setStatusViewFilter("Activos")}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${statusViewFilter === "Activos" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                Activos
              </button>
              <button
                type="button"
                onClick={() => setStatusViewFilter("Archivados")}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${statusViewFilter === "Archivados" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                Archivados
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filtrar por nombre de proyecto..."
            className="w-72 rounded-xl border border-slate-200 px-4 py-2 text-sm"
          />

          <select
            value={coordinatorFilter}
            onChange={(event) => setCoordinatorFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
          >
            {coordinators.map((coordinator) => {
              return (
                <option key={coordinator} value={coordinator}>
                  Encargado: {coordinator}
                </option>
              );
            })}
          </select>

          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value as RiskLevel | "Todos")}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
          >
            <option value="Todos">Riesgo: todos</option>
            <option value="Alto">Riesgo alto</option>
            <option value="Medio">Riesgo medio</option>
            <option value="Bajo">Riesgo bajo</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">Proyectos activos</p>
          <p className="mt-1 text-3xl font-bold text-slate-700">{kpiActiveProjects}</p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
          <p className="text-sm text-slate-700">Encargados activos</p>
          <p className="mt-1 text-3xl font-bold text-indigo-700">{orderedCoordinatorStats.length}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Etapas globales</p>
            <span className="text-xs text-slate-500">{totalStageAssignments} proyectos</span>
          </div>

          {orderedStageStats.length > 0 ? (() => {
            const COLORS = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa"];
            const SIZE = 200;
            const RADIUS = 76;
            const STROKE = 28;
            const CX = SIZE / 2;
            const CY = SIZE / 2;
            const circumference = 2 * Math.PI * RADIUS;

            let cumulativePercent = 0;
            const slices = orderedStageStats.map(([stage, count], i) => {
              const pct = totalStageAssignments > 0 ? count / totalStageAssignments : 0;
              const offset = circumference * (1 - cumulativePercent);
              const dashLen = circumference * pct;
              cumulativePercent += pct;
              return { stage, count, pct, offset, dashLen, color: COLORS[i % COLORS.length] };
            });

            return (
              <div className="mt-5 flex items-center gap-8">
                <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
                  {slices.map((slice) => (
                    <circle
                      key={`donut-${slice.stage}`}
                      cx={CX} cy={CY} r={RADIUS}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth={STROKE}
                      strokeDasharray={`${slice.dashLen} ${circumference - slice.dashLen}`}
                      strokeDashoffset={slice.offset}
                    />
                  ))}
                </svg>
                <div className="flex flex-1 flex-col gap-3">
                  {slices.map((slice) => (
                    <div key={`legend-${slice.stage}`} className="flex items-center gap-3">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                      <span className="flex-1 text-sm font-medium text-slate-700">{slice.stage}</span>
                      <span className="text-xs text-slate-500">{slice.count} · {Math.round(slice.pct * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })() : (
            <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">Sin etapas registradas.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Carga por encargado</p>
            <span className="text-xs text-slate-500">{orderedCoordinatorStats.length} persona(s)</span>
          </div>

          <div className="mt-3 space-y-2">
            {orderedCoordinatorStats.length > 0 ? orderedCoordinatorStats.map(([name, stats]) => (
              <div key={`coordinator-stat-${name}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{name}</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">{stats.total} proyecto(s)</span>
                </div>
                <div className="mt-1.5 flex gap-3">
                  {stats.design > 0 && (
                    <span className="flex items-center gap-1 text-xs text-indigo-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      Diseño: {stats.design}
                    </span>
                  )}
                  {stats.construction > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Construcción: {stats.construction}
                    </span>
                  )}
                </div>
              </div>
            )) : (
              <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">Sin encargados registrados.</p>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1100px] w-full">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3">Proyecto</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Etapa</th>
              <th className="px-4 py-3">Líder de diseño</th>
              <th className="px-4 py-3">Líder de construcción</th>
              <th className="px-4 py-3">Proxima entrega</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibleProjects.map((project) => (
              <tr key={`table-${project.id}`} className="border-b border-slate-100 text-sm text-slate-800 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-blue-700">
                  <Link href={projectTasksPath(project.name)}>{project.name}</Link>
                </td>
                <td className="px-4 py-3">{project.client.name}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {project.stage
                      .split("/")
                      .map((stage) => stage.trim())
                      .filter(Boolean)
                      .map((stage) => (
                        <span key={`${project.id}-${stage}`} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                          {stage}
                        </span>
                      ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {projectsCapabilities.canEditProjectGeneral && inlineEditingCell?.projectId === project.id && inlineEditingCell.field === "design" ? (
                    <select
                      value={normalizeName(project.coordinator) || "Sin encargado"}
                      onChange={(event) => {
                        updateCoordinator(project.id, event.target.value);
                        setInlineEditingCell(null);
                      }}
                      onBlur={() => setInlineEditingCell(null)}
                      autoFocus
                      className="rounded-lg border border-blue-300 bg-white px-2 py-1 text-sm text-slate-700 focus:outline-none"
                    >
                      <option value="Sin encargado">Sin encargado</option>
                      {getCoordinatorOptions(project).map((member) => (
                        <option key={`table-design-${project.id}-${member}`} value={member}>{member}</option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`text-sm text-slate-800 ${projectsCapabilities.canEditProjectGeneral ? "cursor-pointer hover:text-blue-600" : ""}`}
                      onClick={() => {
                        if (!projectsCapabilities.canEditProjectGeneral) {
                          return;
                        }

                        setInlineEditingCell({ projectId: project.id, field: "design" });
                      }}
                    >
                      {normalizeName(project.coordinator) || "Sin encargado"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {projectsCapabilities.canEditProjectGeneral && inlineEditingCell?.projectId === project.id && inlineEditingCell.field === "construction" ? (
                    <select
                      value={secondaryCoordinatorByProject[project.id] || "Sin encargado"}
                      onChange={(event) => {
                        setSecondaryCoordinatorByProject((current) => ({ ...current, [project.id]: event.target.value }));
                        setInlineEditingCell(null);
                      }}
                      onBlur={() => setInlineEditingCell(null)}
                      autoFocus
                      className="rounded-lg border border-blue-300 bg-white px-2 py-1 text-sm text-slate-700 focus:outline-none"
                    >
                      <option value="Sin encargado">Sin encargado</option>
                      {getCoordinatorOptions(project).map((member) => (
                        <option key={`table-construction-${project.id}-${member}`} value={member}>{member}</option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`text-sm text-slate-800 ${projectsCapabilities.canEditProjectGeneral ? "cursor-pointer hover:text-blue-600" : ""}`}
                      onClick={() => {
                        if (!projectsCapabilities.canEditProjectGeneral) {
                          return;
                        }

                        setInlineEditingCell({ projectId: project.id, field: "construction" });
                      }}
                    >
                      {secondaryCoordinatorByProject[project.id] || "Sin encargado"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3" suppressHydrationWarning>{project.nextDelivery ? formatDate(project.nextDelivery.toISOString()) : "Sin fecha"}</td>
                <td className="px-4 py-3">
                  <div className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${projectStatusDotClasses(project.active)}`} />
                    <select
                      value={project.active ? "activo" : "archivado"}
                      onChange={(event) => updateProjectActive(project.id, event.target.value === "activo")}
                      disabled={!projectsCapabilities.canArchiveProject}
                      className={`rounded-lg border px-2 py-1 text-xs font-semibold ${projectStatusSelectClasses(project.active)}`}
                      aria-label={`Estado en tabla de ${project.name}`}
                    >
                      <option value="activo">Proyecto activo</option>
                      <option value="archivado">Proyecto archivado</option>
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/proyectos/${project.id}/ficha`} className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                      Ficha
                    </Link>
                    <Link href={projectTasksPath(project.name)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                      Actividades
                    </Link>
                    <button
                      onClick={() => openNotesModal(project.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Nota
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {[
            {
              key: "activos",
              title: "Proyectos activos",
              items: visibleProjects.filter((project) => project.active),
            },
            {
              key: "archivados",
              title: "Proyectos archivados",
              items: visibleProjects.filter((project) => !project.active),
            },
          ].map((section) => (
            <div key={section.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{section.title}</h3>
                <span className="text-xs text-slate-500">{section.items.length}</span>
              </div>

              {section.items.length > 0 ? section.items.map((project) => (
                <div key={project.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

                {/* Nombre + estado */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{project.code}</p>
                    <h3 className="text-xl font-bold text-slate-900">{project.name}</h3>
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${projectStatusDotClasses(project.active)}`} />
                    <select
                      value={project.active ? "activo" : "archivado"}
                      onChange={(event) => updateProjectActive(project.id, event.target.value === "activo")}
                      disabled={!projectsCapabilities.canArchiveProject}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${projectStatusSelectClasses(project.active)}`}
                      aria-label={`Estado de ${project.name}`}
                    >
                      <option value="activo">Proyecto activo</option>
                      <option value="archivado">Proyecto archivado</option>
                    </select>
                  </div>
                </div>

                {/* Cliente + Equipo Asignado */}
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Cliente</p>
                    <p className="font-semibold text-slate-800">{project.client.name}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-slate-600">Líder de diseño</p>
                      <select
                        value={normalizeName(project.coordinator) || "Sin responsable"}
                        onChange={(event) => updateCoordinator(project.id, event.target.value)}
                        disabled={!projectsCapabilities.canEditProjectGeneral}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                        aria-label={`Líder de diseño de ${project.name}`}
                      >
                        <option value="Sin responsable">Sin encargado</option>
                        {getCoordinatorOptions(project).map((member) => (
                          <option key={`card-coordinator-${project.id}-${member}`} value={member}>
                            {member}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-slate-600">Líder de construcción</p>
                      <select
                        value={secondaryCoordinatorByProject[project.id] || "Sin responsable"}
                        onChange={(event) => {
                          if (!projectsCapabilities.canEditProjectGeneral) {
                            return;
                          }

                          setSecondaryCoordinatorByProject((current) => ({
                            ...current,
                            [project.id]: event.target.value,
                          }));
                        }}
                        disabled={!projectsCapabilities.canEditProjectGeneral}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                        aria-label={`Líder de construcción de ${project.name}`}
                      >
                        <option value="Sin responsable">Sin encargado</option>
                        {getCoordinatorOptions(project).map((member) => (
                          <option key={`card-construction-coordinator-${project.id}-${member}`} value={member}>
                            {member}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Actividad + tipo */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {project.stage
                    .split("/")
                    .map((stage) => stage.trim())
                    .filter(Boolean)
                    .map((stage) => (
                      <span key={`card-stage-${project.id}-${stage}`} className="rounded-full border border-blue-200 bg-blue-100/70 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {stage}
                      </span>
                    ))}
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">{project.type}</span>
                </div>

                {/* Avance + Próxima entrega */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Avance</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{project.progress}%</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Próxima entrega</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800" suppressHydrationWarning>{project.nextDelivery ? formatDate(project.nextDelivery.toISOString()) : "Sin fecha"}</p>
                  </div>
                </div>

                {/* Links */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={projectTasksPath(project.name)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    Actividades
                  </Link>
                  <a
                    href={project.drive?.administrativo || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={`rounded-lg border px-4 py-2 text-sm font-medium ${project.drive?.administrativo ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`}
                  >
                    Docs del proyecto
                  </a>
                  <a
                    href={project.drive?.reportes || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={`rounded-lg border px-4 py-2 text-sm font-medium ${project.drive?.reportes ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`}
                  >
                    Docs del cliente
                  </a>
                </div>

                {/* Pie: alerta + acciones */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500" suppressHydrationWarning>
                    {project.startDate ? `Inicio: ${formatDate(project.startDate)} · ` : ""}
                    Alerta: {project.mainAlert}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openNotesModal(project.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Registrar nota
                    </button>
                    <Link href={`/proyectos/${project.id}/ficha`} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Ficha del proyecto
                    </Link>
                    {section.key === "archivados" ? (
                      <button
                        onClick={() => deleteProject(project.id)}
                        disabled={!projectsCapabilities.canDeleteProject}
                        title={projectsCapabilities.canDeleteProject ? "" : "No tienes permiso para eliminar proyectos"}
                        className={`rounded-lg border px-3 py-1 text-sm font-medium ${projectsCapabilities.canDeleteProject ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
                      >
                        Eliminar proyecto
                      </button>
                    ) : null}
                  </div>
                </div>

              </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  No hay proyectos en esta seccion.
                </div>
              )}
            </div>
          ))}

          {visibleProjects.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No hay proyectos con los filtros actuales.
            </div>
          ) : null}
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Atencion inmediata</h3>
          <p className="mt-1 text-sm text-slate-600">Proyectos que requieren accion hoy.</p>

          <div className="mt-4 space-y-3">
            {alerts.map((project) => (
              <div key={`alert-${project.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-800">{project.name}</p>
                <p className="mt-1 text-xs text-slate-600">{project.mainAlert}</p>
              </div>
            ))}

            {alerts.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No hay alertas criticas por ahora.
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {activeNoteProject ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h4 className="text-lg font-bold text-slate-900">Notas del proyecto</h4>
                <p className="text-sm text-slate-600">{activeNoteProject.name}</p>
              </div>
              <button
                onClick={closeNotesModal}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Escribe una nota operativa..."
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={closeNotesModal}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveNote}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Guardar nota
                </button>
              </div>

              <div className="max-h-72 space-y-3 overflow-y-auto border-t border-slate-200 pt-4">
                {activeNotes.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                    Todavia no hay notas para este proyecto.
                  </p>
                ) : (
                  activeNotes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm text-slate-800">{note.content}</p>
                      <p className="mt-2 text-xs text-slate-500">{formatDate(note.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h4 className="text-lg font-bold text-slate-900">Nuevo proyecto</h4>
                <p className="text-sm text-slate-600">Crea un proyecto operativo y abre su ficha.</p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-700">
                  Nombre del proyecto
                  <input
                    value={newProjectDraft.name}
                    onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, name: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Cliente (activos existentes)
                  <select
                    value={newProjectDraft.clientId}
                    onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, clientId: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Vincular mas adelante</option>
                    {activeClientOptions.length === 0 ? <option value="">No hay clientes activos</option> : null}
                    {activeClientOptions.map((client) => (
                      <option key={`active-client-${client.id}`} value={String(client.id)}>
                        {client.name} ({client.kind})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  Tipo de proyecto
                  <select
                    value={newProjectDraft.type}
                    onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, type: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {projectTypeOptions.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  Etapas (seleccion multiple)
                  <div className="mt-1 grid gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                    {STAGE_OPTIONS.map((stage) => (
                      <label key={`stage-${stage}`} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={newProjectDraft.stages.includes(stage)}
                          onChange={(event) => {
                            setNewProjectDraft((prev) => {
                              const hasStage = prev.stages.includes(stage);

                              if (event.target.checked && !hasStage) {
                                return { ...prev, stages: [...prev.stages, stage] };
                              }

                              if (!event.target.checked && hasStage) {
                                return { ...prev, stages: prev.stages.filter((item) => item !== stage) };
                              }

                              return prev;
                            });
                          }}
                        />
                        {stage}
                      </label>
                    ))}
                  </div>
                </label>

                <label className="text-sm text-slate-700">
                  Encargado
                  <select
                    value={newProjectDraft.coordinator}
                    onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, coordinator: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Sin responsable">Sin encargado</option>
                    {activeTeamNames.map((name) => (
                      <option key={`new-coordinator-${name}`} value={name}>{name}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-slate-700 sm:col-span-2">
                  Vinculo Google Doc del proyecto
                  <input
                    value={newProjectDraft.docsUrl}
                    onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, docsUrl: event.target.value }))}
                    placeholder="https://docs.google.com/..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <label className="text-sm text-slate-700 sm:col-span-2">
                  Fecha de inicio
                  <input
                    type="date"
                    value={newProjectDraft.startDate}
                    onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, startDate: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>
              </div>

              {createError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createProject}
                  disabled={!projectsCapabilities.canCreateProject}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Crear proyecto
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}