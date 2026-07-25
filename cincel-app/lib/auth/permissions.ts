import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";
import type { ResourceSection } from "@/lib/types/resource";

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

export type ClientsCapabilities = {
  canViewClients: boolean;
  canCreateClient: boolean;
  canEditClient: boolean;
  canDeleteClient: boolean;
};

export type TeamCapabilities = {
  canViewTeam: boolean;
  canCreateCollaborator: boolean;
  canEditCollaborator: boolean;
  canChangeCollaboratorAccess: boolean;
  canToggleCollaboratorActive: boolean;
  canDeleteCollaborator: boolean;
};

type ResourceEditScope = "all" | "owned_or_personal" | "none";

export type ResourcesCapabilities = {
  canViewResources: boolean;
  canManageFavoritesSection: boolean;
  enterprise: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canCreateCategory: boolean;
  };
  corporate: {
    canCreate: boolean;
    canDelete: boolean;
    editScope: ResourceEditScope;
  };
};

export const CORPORATE_RESOURCES_SECTIONS: ReadonlyArray<ResourceSection> = [
  "mis-documentos",
  "plantillas-diseno",
  "formatos-obra",
  "mis-vacaciones",
  "formacion",
];

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
  "Jefe de Taller": {
    dataScope: "managed_projects",
    sections: {
      showProjectAssignments: true,
      showProjectRisk: true,
      showTeamWorkload: true,
    },
  },
  "Jefe de Construcción": {
    dataScope: "managed_projects",
    sections: {
      showProjectAssignments: true,
      showProjectRisk: true,
      showTeamWorkload: true,
    },
  },
  "Arquitecto Senior": {
    dataScope: "managed_projects",
    sections: {
      showProjectAssignments: true,
      showProjectRisk: true,
      showTeamWorkload: true,
    },
  },
  "Arquitecto Junior": {
    dataScope: "assigned_tasks",
    sections: {
      showProjectAssignments: false,
      showProjectRisk: false,
      showTeamWorkload: false,
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
  Otros: {
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
  "Jefe de Taller": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: false,
    canReorderPhases: true,
    statusScope: "all",
  },
  "Jefe de Construcción": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: false,
    canReorderPhases: true,
    statusScope: "all",
  },
  "Arquitecto Senior": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: false,
    canReorderPhases: true,
    statusScope: "all",
  },
  "Arquitecto Junior": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: false,
    canDeleteActivity: false,
    canReorderPhases: false,
    statusScope: "assigned_or_participant",
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
  Otros: {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: false,
    canDeleteActivity: false,
    canReorderPhases: false,
    statusScope: "assigned_or_participant",
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
  "Jefe de Taller": {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
  },
  "Jefe de Construcción": {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
  },
  "Arquitecto Senior": {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
  },
  "Arquitecto Junior": {
    canViewProjects: true,
    canCreateProject: false,
    canEditProjectGeneral: false,
    canChangeProjectStage: false,
    canArchiveProject: false,
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
  Otros: {
    canViewProjects: true,
    canCreateProject: false,
    canEditProjectGeneral: false,
    canChangeProjectStage: false,
    canArchiveProject: false,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
  },
};

const RESOURCES_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, ResourcesCapabilities> = {
  Administrador: {
    canViewResources: true,
    canManageFavoritesSection: true,
    enterprise: {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canCreateCategory: true,
    },
    corporate: {
      canCreate: true,
      canDelete: true,
      editScope: "all",
    },
  },
  "Dirección": {
    canViewResources: true,
    canManageFavoritesSection: true,
    enterprise: {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canCreateCategory: false,
    },
    corporate: {
      canCreate: true,
      canDelete: true,
      editScope: "all",
    },
  },
  "Jefe de Taller": {
    canViewResources: true,
    canManageFavoritesSection: true,
    enterprise: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canCreateCategory: false,
    },
    corporate: {
      canCreate: true,
      canDelete: false,
      editScope: "all",
    },
  },
  "Jefe de Construcción": {
    canViewResources: true,
    canManageFavoritesSection: true,
    enterprise: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canCreateCategory: false,
    },
    corporate: {
      canCreate: true,
      canDelete: false,
      editScope: "all",
    },
  },
  "Arquitecto Senior": {
    canViewResources: true,
    canManageFavoritesSection: true,
    enterprise: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canCreateCategory: false,
    },
    corporate: {
      canCreate: true,
      canDelete: false,
      editScope: "all",
    },
  },
  "Arquitecto Junior": {
    canViewResources: true,
    canManageFavoritesSection: true,
    enterprise: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canCreateCategory: false,
    },
    corporate: {
      canCreate: true,
      canDelete: false,
      editScope: "owned_or_personal",
    },
  },
  Colaborador: {
    canViewResources: true,
    canManageFavoritesSection: true,
    enterprise: {
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canCreateCategory: false,
    },
    corporate: {
      canCreate: true,
      canDelete: false,
      editScope: "owned_or_personal",
    },
  },
  "Pasante / Servicio Social": {
    canViewResources: true,
    canManageFavoritesSection: true,
    enterprise: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canCreateCategory: false,
    },
    corporate: {
      canCreate: true,
      canDelete: false,
      editScope: "owned_or_personal",
    },
  },
  Otros: {
    canViewResources: true,
    canManageFavoritesSection: true,
    enterprise: {
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canCreateCategory: false,
    },
    corporate: {
      canCreate: true,
      canDelete: false,
      editScope: "owned_or_personal",
    },
  },
};

const CLIENTS_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, ClientsCapabilities> = {
  Administrador: {
    canViewClients: true,
    canCreateClient: true,
    canEditClient: true,
    canDeleteClient: true,
  },
  "Dirección": {
    canViewClients: true,
    canCreateClient: true,
    canEditClient: true,
    canDeleteClient: true,
  },
  "Jefe de Taller": {
    canViewClients: true,
    canCreateClient: true,
    canEditClient: true,
    canDeleteClient: false,
  },
  "Jefe de Construcción": {
    canViewClients: true,
    canCreateClient: true,
    canEditClient: true,
    canDeleteClient: false,
  },
  "Arquitecto Senior": {
    canViewClients: true,
    canCreateClient: true,
    canEditClient: true,
    canDeleteClient: false,
  },
  "Arquitecto Junior": {
    canViewClients: false,
    canCreateClient: false,
    canEditClient: false,
    canDeleteClient: false,
  },
  Colaborador: {
    canViewClients: false,
    canCreateClient: false,
    canEditClient: false,
    canDeleteClient: false,
  },
  "Pasante / Servicio Social": {
    canViewClients: false,
    canCreateClient: false,
    canEditClient: false,
    canDeleteClient: false,
  },
  Otros: {
    canViewClients: false,
    canCreateClient: false,
    canEditClient: false,
    canDeleteClient: false,
  },
};

const TEAM_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, TeamCapabilities> = {
  Administrador: {
    canViewTeam: true,
    canCreateCollaborator: true,
    canEditCollaborator: true,
    canChangeCollaboratorAccess: true,
    canToggleCollaboratorActive: true,
    canDeleteCollaborator: true,
  },
  "Dirección": {
    canViewTeam: true,
    canCreateCollaborator: true,
    canEditCollaborator: true,
    canChangeCollaboratorAccess: true,
    canToggleCollaboratorActive: true,
    canDeleteCollaborator: false,
  },
  "Jefe de Taller": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
  },
  "Jefe de Construcción": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
  },
  "Arquitecto Senior": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
  },
  "Arquitecto Junior": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
  },
  Colaborador: {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
  },
  "Pasante / Servicio Social": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
  },
  Otros: {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
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

export function resolveResourcesCapabilities(user: AuthenticatedUser | null): ResourcesCapabilities {
  const access = user?.access ?? "Colaborador";
  return RESOURCES_CAPABILITIES_BY_ROLE[access];
}

export function canViewResourceSection({
  capabilities,
  section,
}: {
  capabilities: ResourcesCapabilities;
  section: ResourceSection;
}): boolean {
  if (section === "empresa") {
    return capabilities.enterprise.canView;
  }

  return capabilities.canViewResources;
}

export function canCreateResourceCategoryInSection({
  capabilities,
  section,
}: {
  capabilities: ResourcesCapabilities;
  section: ResourceSection;
}): boolean {
  if (section === "empresa") {
    return capabilities.enterprise.canCreateCategory;
  }

  return false;
}

export function resolveClientsCapabilities(user: AuthenticatedUser | null): ClientsCapabilities {
  const access = user?.access ?? "Colaborador";
  return CLIENTS_CAPABILITIES_BY_ROLE[access];
}

export function resolveTeamCapabilities(user: AuthenticatedUser | null): TeamCapabilities {
  const access = user?.access ?? "Colaborador";
  return TEAM_CAPABILITIES_BY_ROLE[access];
}

export function isCorporateResourcesSection(section: ResourceSection): boolean {
  return CORPORATE_RESOURCES_SECTIONS.includes(section);
}

export function canCreateResourceInSection({
  capabilities,
  section,
}: {
  capabilities: ResourcesCapabilities;
  section: ResourceSection;
}): boolean {
  if (isCorporateResourcesSection(section)) {
    return capabilities.corporate.canCreate;
  }

  if (section === "mis-favoritos") {
    return capabilities.canManageFavoritesSection;
  }

  if (section === "empresa") {
    return capabilities.enterprise.canCreate;
  }

  return false;
}

export function canDeleteResourceInSection({
  capabilities,
  section,
}: {
  capabilities: ResourcesCapabilities;
  section: ResourceSection;
}): boolean {
  if (isCorporateResourcesSection(section)) {
    return capabilities.corporate.canDelete;
  }

  if (section === "mis-favoritos") {
    return capabilities.canManageFavoritesSection;
  }

  if (section === "empresa") {
    return capabilities.enterprise.canDelete;
  }

  return false;
}

export function canEditResourceInSection({
  capabilities,
  section,
  viewerMemberId,
  ownerTeamMemberId,
  personalForTeamMemberId,
}: {
  capabilities: ResourcesCapabilities;
  section: ResourceSection;
  viewerMemberId: number | null;
  ownerTeamMemberId: number | null;
  personalForTeamMemberId: number | null;
}): boolean {
  if (isCorporateResourcesSection(section)) {
    if (capabilities.corporate.editScope === "all") {
      return true;
    }

    if (capabilities.corporate.editScope === "none") {
      return false;
    }

    if (viewerMemberId === null) {
      return false;
    }

    return ownerTeamMemberId === viewerMemberId || personalForTeamMemberId === viewerMemberId;
  }

  if (section === "mis-favoritos") {
    return capabilities.canManageFavoritesSection;
  }

  if (section === "empresa") {
    return capabilities.enterprise.canEdit;
  }

  return false;
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