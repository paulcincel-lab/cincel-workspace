import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";

export type DashboardDataScope = "global" | "managed_projects" | "assigned_tasks";

export type DashboardCapabilities = {
  dataScope: DashboardDataScope;
  sections: {
    showProjectAssignments: boolean;
    showProjectRisk: boolean;
    showTeamWorkload: boolean;
  };
};

type DashboardProjectShape = {
  id: number;
  name: string;
  manager?: string | null;
};

type DashboardTaskShape = {
  project: string;
  manager?: string | null;
  support?: string[];
};

type ActivityTaskScopeShape = {
  manager?: string | null;
  support?: string[];
};

type ActivityStatusScope = "all" | "assigned_or_participant" | "none";

export type ActivitiesCapabilities = {
  canViewActivities: boolean;
  canCreateActivity: boolean;
  canChangeResponsible: boolean;
  canDeleteActivity: boolean;
  canReorderPhases: boolean;
  statusScope: ActivityStatusScope;
};

export type ProjectsCapabilities = {
  canViewProjects: boolean;
  canCreateProject: boolean;
  canEditProjectGeneral: boolean;
  canChangeProjectStage: boolean;
  canArchiveProject: boolean;
  canDeleteProject: boolean;
  canEditProtectedProjectData: boolean;
};

const DASHBOARD_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, DashboardCapabilities> = {
  Administrador: {
    dataScope: "global",
    sections: {
      showProjectAssignments: true,
      showProjectRisk: true,
      showTeamWorkload: true,
    },
  },
  "Dirección": {
    dataScope: "global",
    sections: {
      showProjectAssignments: true,
      showProjectRisk: true,
      showTeamWorkload: true,
    },
  },
  "Responsable de Proyecto": {
    dataScope: "managed_projects",
    sections: {
      showProjectAssignments: true,
      showProjectRisk: true,
      showTeamWorkload: true,
    },
  },
  Colaborador: {
    dataScope: "assigned_tasks",
    sections: {
      showProjectAssignments: false,
      showProjectRisk: false,
      showTeamWorkload: false,
    },
  },
  "Pasante / Servicio Social": {
    dataScope: "assigned_tasks",
    sections: {
      showProjectAssignments: false,
      showProjectRisk: false,
      showTeamWorkload: false,
    },
  },
  Cliente: {
    dataScope: "assigned_tasks",
    sections: {
      showProjectAssignments: false,
      showProjectRisk: false,
      showTeamWorkload: false,
    },
  },
};

const ACTIVITIES_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, ActivitiesCapabilities> = {
  Administrador: {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: true,
    canReorderPhases: true,
    statusScope: "all",
  },
  "Dirección": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: true,
    canReorderPhases: true,
    statusScope: "all",
  },
  "Responsable de Proyecto": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: false,
    canReorderPhases: true,
    statusScope: "all",
  },
  Colaborador: {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: false,
    canDeleteActivity: false,
    canReorderPhases: false,
    statusScope: "assigned_or_participant",
  },
  "Pasante / Servicio Social": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: false,
    canDeleteActivity: false,
    canReorderPhases: false,
    statusScope: "assigned_or_participant",
  },
  Cliente: {
    canViewActivities: false,
    canCreateActivity: false,
    canChangeResponsible: false,
    canDeleteActivity: false,
    canReorderPhases: false,
    statusScope: "none",
  },
};

const PROJECTS_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, ProjectsCapabilities> = {
  Administrador: {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: true,
    canEditProtectedProjectData: true,
  },
  "Dirección": {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: true,
    canEditProtectedProjectData: true,
  },
  "Responsable de Proyecto": {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
  },
  Colaborador: {
    canViewProjects: true,
    canCreateProject: false,
    canEditProjectGeneral: false,
    canChangeProjectStage: false,
    canArchiveProject: false,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
  },
  "Pasante / Servicio Social": {
    canViewProjects: true,
    canCreateProject: false,
    canEditProjectGeneral: false,
    canChangeProjectStage: false,
    canArchiveProject: false,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
  },
  Cliente: {
    canViewProjects: false,
    canCreateProject: false,
    canEditProjectGeneral: false,
    canChangeProjectStage: false,
    canArchiveProject: false,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
  },
};

function normalizeName(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function taskBelongsToViewer(task: DashboardTaskShape, viewerName: string): boolean {
  if (!viewerName) {
    return false;
  }

  const managerName = normalizeName(task.manager);
  if (managerName && managerName === viewerName) {
    return true;
  }

  return (task.support || []).some((member) => normalizeName(member) === viewerName);
}

function projectIsManagedByViewer(
  project: DashboardProjectShape,
  viewerName: string,
  secondaryCoordinatorByProject: Record<number, string>
): boolean {
  if (!viewerName) {
    return false;
  }

  if (normalizeName(project.manager) === viewerName) {
    return true;
  }

  return normalizeName(secondaryCoordinatorByProject[project.id]) === viewerName;
}

export function resolveDashboardCapabilities(user: AuthenticatedUser | null): DashboardCapabilities {
  const access = user?.access ?? "Colaborador";
  return DASHBOARD_CAPABILITIES_BY_ROLE[access];
}

export function resolveActivitiesCapabilities(user: AuthenticatedUser | null): ActivitiesCapabilities {
  const access = user?.access ?? "Colaborador";
  return ACTIVITIES_CAPABILITIES_BY_ROLE[access];
}

export function resolveProjectsCapabilities(user: AuthenticatedUser | null): ProjectsCapabilities {
  const access = user?.access ?? "Colaborador";
  return PROJECTS_CAPABILITIES_BY_ROLE[access];
}

export function canChangeActivityStatus<TTask extends ActivityTaskScopeShape>({
  capabilities,
  task,
  viewerName,
}: {
  capabilities: ActivitiesCapabilities;
  task: TTask;
  viewerName: string;
}): boolean {
  if (capabilities.statusScope === "all") {
    return true;
  }

  if (capabilities.statusScope === "none") {
    return false;
  }

  const normalizedViewerName = normalizeName(viewerName);
  if (!normalizedViewerName) {
    return false;
  }

  return taskBelongsToViewer(
    {
      project: "",
      manager: task.manager,
      support: task.support,
    },
    normalizedViewerName
  );
}

export function scopeDashboardProjects<TProject extends DashboardProjectShape, TTask extends DashboardTaskShape>({
  projects,
  tasks,
  viewerName,
  dataScope,
  secondaryCoordinatorByProject,
}: {
  projects: TProject[];
  tasks: TTask[];
  viewerName: string;
  dataScope: DashboardDataScope;
  secondaryCoordinatorByProject: Record<number, string>;
}): TProject[] {
  if (dataScope === "global") {
    return projects;
  }

  const normalizedViewerName = normalizeName(viewerName);

  if (dataScope === "managed_projects") {
    return projects.filter((project) => projectIsManagedByViewer(project, normalizedViewerName, secondaryCoordinatorByProject));
  }

  const visibleProjectNames = new Set(
    tasks
      .filter((task) => taskBelongsToViewer(task, normalizedViewerName))
      .map((task) => normalizeName(task.project))
      .filter(Boolean)
  );

  return projects.filter((project) => visibleProjectNames.has(normalizeName(project.name)));
}

export function scopeDashboardTasks<TTask extends DashboardTaskShape>({
  tasks,
  viewerName,
  dataScope,
  allowedProjectNames,
}: {
  tasks: TTask[];
  viewerName: string;
  dataScope: DashboardDataScope;
  allowedProjectNames: Set<string>;
}): TTask[] {
  const normalizedAllowedProjects = new Set(Array.from(allowedProjectNames).map((projectName) => normalizeName(projectName)));
  const normalizedViewerName = normalizeName(viewerName);

  if (dataScope === "assigned_tasks") {
    return tasks.filter((task) => {
      const inAllowedProject = normalizedAllowedProjects.has(normalizeName(task.project));
      return inAllowedProject && taskBelongsToViewer(task, normalizedViewerName);
    });
  }

  return tasks.filter((task) => normalizedAllowedProjects.has(normalizeName(task.project)));
}