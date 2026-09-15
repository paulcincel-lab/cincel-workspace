import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";
import type { ResourceSection } from "@/lib/types/resource";
import { readStorage } from "@/lib/repositories/browser-state-repository";

export const PERMISSIONS_CUSTOM_STORAGE_KEY = "cincel.permissions.custom.v1";

export type DashboardDataScope = "global" | "managed_projects" | "assigned_tasks";

export type DashboardCapabilities = {
  dataScope: DashboardDataScope;
  sections: {
    showProjectAssignments: boolean;
    showProjectRisk: boolean;
    showTeamWorkload: boolean;
  };
};

export type CalendarCapabilities = {
  canViewCalendar: boolean;
  canViewDailyAgenda: boolean;
  canViewTeamCalendar: boolean;
};

type DashboardProjectShape = {
  id: string;
  name: string;
  manager?: { id: string } | null;
};

type DashboardTaskShape = {
  project: { id: string; name: string };
  manager?: { id: string } | null;
  support?: Array<{ id: string }>;
};

type ActivityTaskScopeShape = {
  manager?: { id: string } | null;
  support?: Array<{ id: string }>;
};

type ActivityStatusScope = "all" | "assigned_or_participant" | "none";

export type ActivitiesCapabilities = {
  canViewActivities: boolean;
  canCreateActivity: boolean;
  canChangeResponsible: boolean;
  canDeleteActivity: boolean;
  canReorderPhases: boolean;
  canExportData: boolean;
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
  canExportData: boolean;
};

export type ClientsCapabilities = {
  canViewClients: boolean;
  canCreateClient: boolean;
  canEditClient: boolean;
  canDeleteClient: boolean;
  canExportData: boolean;
};

export type TeamCapabilities = {
  canViewTeam: boolean;
  canCreateCollaborator: boolean;
  canEditCollaborator: boolean;
  canChangeCollaboratorAccess: boolean;
  canToggleCollaboratorActive: boolean;
  canDeleteCollaborator: boolean;
  canExportData: boolean;
};

/**
 * Areas (`core.areas`, `core.area_members`, `core.area_workflows`) are a
 * company-structure admin surface: everyone can see the directory (staff
 * pickers, task assignment) but only Administrador / Dirección manage it.
 */
export type AreasCapabilities = {
  canViewAreas: boolean;
  canManageAreas: boolean;
};

/**
 * Workflows and their task templates (`core.workflows`,
 * `core.workflow_task_templates`) are the other half of the "method" admin
 * surface — same view-all / manage-admin-only shape as areas.
 */
export type WorkflowsCapabilities = {
  canViewWorkflows: boolean;
  canManageWorkflows: boolean;
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

const CALENDAR_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, CalendarCapabilities> = {
  Administrador: {
    canViewCalendar: true,
    canViewDailyAgenda: true,
    canViewTeamCalendar: true,
  },
  "Dirección": {
    canViewCalendar: true,
    canViewDailyAgenda: true,
    canViewTeamCalendar: true,
  },
  "Jefe de Taller": {
    canViewCalendar: true,
    canViewDailyAgenda: true,
    canViewTeamCalendar: false,
  },
  "Jefe de Construcción": {
    canViewCalendar: true,
    canViewDailyAgenda: true,
    canViewTeamCalendar: false,
  },
  "Arquitecto Senior": {
    canViewCalendar: true,
    canViewDailyAgenda: true,
    canViewTeamCalendar: false,
  },
  "Arquitecto Junior": {
    canViewCalendar: true,
    canViewDailyAgenda: true,
    canViewTeamCalendar: false,
  },
  Colaborador: {
    canViewCalendar: true,
    canViewDailyAgenda: true,
    canViewTeamCalendar: false,
  },
  "Pasante / Servicio Social": {
    canViewCalendar: true,
    canViewDailyAgenda: true,
    canViewTeamCalendar: false,
  },
  Otros: {
    canViewCalendar: true,
    canViewDailyAgenda: true,
    canViewTeamCalendar: false,
  },
};

const ACTIVITIES_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, ActivitiesCapabilities> = {
  Administrador: {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: true,
    canReorderPhases: true,
    canExportData: true,
    statusScope: "all",
  },
  "Dirección": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: true,
    canReorderPhases: true,
    canExportData: true,
    statusScope: "all",
  },
  "Jefe de Taller": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: false,
    canReorderPhases: true,
    canExportData: false,
    statusScope: "all",
  },
  "Jefe de Construcción": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: false,
    canReorderPhases: true,
    canExportData: false,
    statusScope: "all",
  },
  "Arquitecto Senior": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: false,
    canReorderPhases: true,
    canExportData: false,
    statusScope: "all",
  },
  "Arquitecto Junior": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: false,
    canDeleteActivity: false,
    canReorderPhases: false,
    canExportData: false,
    statusScope: "assigned_or_participant",
  },
  Colaborador: {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: false,
    canDeleteActivity: false,
    canReorderPhases: false,
    canExportData: false,
    statusScope: "assigned_or_participant",
  },
  "Pasante / Servicio Social": {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: false,
    canDeleteActivity: false,
    canReorderPhases: false,
    canExportData: false,
    statusScope: "assigned_or_participant",
  },
  Otros: {
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: false,
    canDeleteActivity: false,
    canReorderPhases: false,
    canExportData: false,
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
    canExportData: true,
  },
  "Dirección": {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: true,
    canEditProtectedProjectData: true,
    canExportData: true,
  },
  "Jefe de Taller": {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
    canExportData: false,
  },
  "Jefe de Construcción": {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
    canExportData: false,
  },
  "Arquitecto Senior": {
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: true,
    canArchiveProject: true,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
    canExportData: false,
  },
  "Arquitecto Junior": {
    canViewProjects: true,
    canCreateProject: false,
    canEditProjectGeneral: false,
    canChangeProjectStage: false,
    canArchiveProject: false,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
    canExportData: false,
  },
  Colaborador: {
    canViewProjects: true,
    canCreateProject: false,
    canEditProjectGeneral: false,
    canChangeProjectStage: false,
    canArchiveProject: false,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
    canExportData: false,
  },
  "Pasante / Servicio Social": {
    canViewProjects: true,
    canCreateProject: false,
    canEditProjectGeneral: false,
    canChangeProjectStage: false,
    canArchiveProject: false,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
    canExportData: false,
  },
  Otros: {
    canViewProjects: true,
    canCreateProject: false,
    canEditProjectGeneral: false,
    canChangeProjectStage: false,
    canArchiveProject: false,
    canDeleteProject: false,
    canEditProtectedProjectData: false,
    canExportData: false,
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
    canExportData: true,
  },
  "Dirección": {
    canViewClients: true,
    canCreateClient: true,
    canEditClient: true,
    canDeleteClient: true,
    canExportData: true,
  },
  "Jefe de Taller": {
    canViewClients: true,
    canCreateClient: true,
    canEditClient: true,
    canDeleteClient: false,
    canExportData: false,
  },
  "Jefe de Construcción": {
    canViewClients: true,
    canCreateClient: true,
    canEditClient: true,
    canDeleteClient: false,
    canExportData: false,
  },
  "Arquitecto Senior": {
    canViewClients: true,
    canCreateClient: true,
    canEditClient: true,
    canDeleteClient: false,
    canExportData: false,
  },
  "Arquitecto Junior": {
    canViewClients: false,
    canCreateClient: false,
    canEditClient: false,
    canDeleteClient: false,
    canExportData: false,
  },
  Colaborador: {
    canViewClients: false,
    canCreateClient: false,
    canEditClient: false,
    canDeleteClient: false,
    canExportData: false,
  },
  "Pasante / Servicio Social": {
    canViewClients: false,
    canCreateClient: false,
    canEditClient: false,
    canDeleteClient: false,
    canExportData: false,
  },
  Otros: {
    canViewClients: false,
    canCreateClient: false,
    canEditClient: false,
    canDeleteClient: false,
    canExportData: false,
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
    canExportData: true,
  },
  "Dirección": {
    canViewTeam: true,
    canCreateCollaborator: true,
    canEditCollaborator: true,
    canChangeCollaboratorAccess: true,
    canToggleCollaboratorActive: true,
    canDeleteCollaborator: false,
    canExportData: true,
  },
  "Jefe de Taller": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
    canExportData: false,
  },
  "Jefe de Construcción": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
    canExportData: false,
  },
  "Arquitecto Senior": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
    canExportData: false,
  },
  "Arquitecto Junior": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
    canExportData: false,
  },
  Colaborador: {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
    canExportData: false,
  },
  "Pasante / Servicio Social": {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
    canExportData: false,
  },
  Otros: {
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: false,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
    canExportData: false,
  },
};

function canManageCompanyStructureByRole(access: SystemAccessRole): boolean {
  return access === "Administrador" || access === "Dirección";
}

const AREAS_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, AreasCapabilities> = Object.fromEntries(
  SYSTEM_ACCESS_ROLES.map((role) => [
    role,
    { canViewAreas: true, canManageAreas: canManageCompanyStructureByRole(role) },
  ])
) as Record<SystemAccessRole, AreasCapabilities>;

const WORKFLOWS_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, WorkflowsCapabilities> = Object.fromEntries(
  SYSTEM_ACCESS_ROLES.map((role) => [
    role,
    { canViewWorkflows: true, canManageWorkflows: canManageCompanyStructureByRole(role) },
  ])
) as Record<SystemAccessRole, WorkflowsCapabilities>;

type StoredModulePermissionsState = Record<string, unknown>;

type StoredRolePermissionsState = Record<string, StoredModulePermissionsState>;

type StoredPermissionsState = {
  version: 1;
  roles: Record<string, StoredRolePermissionsState>;
};

function taskBelongsToViewer(task: DashboardTaskShape, viewerId: string): boolean {
  if (!viewerId) {
    return false;
  }

  if (task.manager?.id === viewerId) {
    return true;
  }

  return (task.support || []).some((member) => member.id === viewerId);
}

function projectIsManagedByViewer(project: DashboardProjectShape, viewerId: string): boolean {
  if (!viewerId) {
    return false;
  }

  return project.manager?.id === viewerId;
}

function resolveAccess(user: AuthenticatedUser | null): SystemAccessRole {
  return user?.access ?? "Colaborador";
}

function canExportByRole(access: SystemAccessRole): boolean {
  return access === "Administrador" || access === "Dirección";
}

function readCustomPermissionsPayload(): StoredPermissionsState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = readStorage(PERMISSIONS_CUSTOM_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as StoredPermissionsState;

    if (parsed.version !== 1 || !parsed.roles || typeof parsed.roles !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function readRoleModuleOverrides(role: SystemAccessRole, moduleId: string): StoredModulePermissionsState | null {
  const payload = readCustomPermissionsPayload();

  if (!payload) {
    return null;
  }

  const roleState = payload.roles[role];

  if (!roleState || typeof roleState !== "object") {
    return null;
  }

  const moduleState = roleState[moduleId];

  if (!moduleState || typeof moduleState !== "object") {
    return null;
  }

  return moduleState;
}

function readBooleanOverride(moduleState: StoredModulePermissionsState | null, key: string, fallback: boolean): boolean {
  const value = moduleState?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function readEnumOverride<TValue extends string>({
  moduleState,
  key,
  allowed,
  fallback,
}: {
  moduleState: StoredModulePermissionsState | null;
  key: string;
  allowed: readonly TValue[];
  fallback: TValue;
}): TValue {
  const value = moduleState?.[key];

  if (typeof value !== "string") {
    return fallback;
  }

  return allowed.includes(value as TValue) ? (value as TValue) : fallback;
}

export function resolveDashboardCapabilitiesFromDefaults(user: AuthenticatedUser | null): DashboardCapabilities {
  const access = resolveAccess(user);
  return DASHBOARD_CAPABILITIES_BY_ROLE[access];
}

export function resolveCalendarCapabilitiesFromDefaults(user: AuthenticatedUser | null): CalendarCapabilities {
  const access = resolveAccess(user);
  return CALENDAR_CAPABILITIES_BY_ROLE[access];
}

export function resolveActivitiesCapabilitiesFromDefaults(user: AuthenticatedUser | null): ActivitiesCapabilities {
  const access = resolveAccess(user);
  return ACTIVITIES_CAPABILITIES_BY_ROLE[access];
}

export function resolveProjectsCapabilitiesFromDefaults(user: AuthenticatedUser | null): ProjectsCapabilities {
  const access = resolveAccess(user);
  return PROJECTS_CAPABILITIES_BY_ROLE[access];
}

export function resolveResourcesCapabilitiesFromDefaults(user: AuthenticatedUser | null): ResourcesCapabilities {
  const access = resolveAccess(user);
  return RESOURCES_CAPABILITIES_BY_ROLE[access];
}

export function resolveClientsCapabilitiesFromDefaults(user: AuthenticatedUser | null): ClientsCapabilities {
  const access = resolveAccess(user);
  return CLIENTS_CAPABILITIES_BY_ROLE[access];
}

export function resolveTeamCapabilitiesFromDefaults(user: AuthenticatedUser | null): TeamCapabilities {
  const access = resolveAccess(user);
  return TEAM_CAPABILITIES_BY_ROLE[access];
}

export function resolveAreasCapabilitiesFromDefaults(user: AuthenticatedUser | null): AreasCapabilities {
  const access = resolveAccess(user);
  return AREAS_CAPABILITIES_BY_ROLE[access];
}

export function resolveWorkflowsCapabilitiesFromDefaults(user: AuthenticatedUser | null): WorkflowsCapabilities {
  const access = resolveAccess(user);
  return WORKFLOWS_CAPABILITIES_BY_ROLE[access];
}

export function resolveDashboardCapabilities(user: AuthenticatedUser | null): DashboardCapabilities {
  const access = resolveAccess(user);
  const defaults = resolveDashboardCapabilitiesFromDefaults(user);
  const moduleOverrides = readRoleModuleOverrides(access, "dashboard");

  if (!moduleOverrides) {
    return defaults;
  }

  return {
    dataScope: readEnumOverride({
      moduleState: moduleOverrides,
      key: "dataScope",
      allowed: ["global", "managed_projects", "assigned_tasks"],
      fallback: defaults.dataScope,
    }),
    sections: {
      showProjectAssignments: readBooleanOverride(moduleOverrides, "showProjectAssignments", defaults.sections.showProjectAssignments),
      showProjectRisk: readBooleanOverride(moduleOverrides, "showProjectRisk", defaults.sections.showProjectRisk),
      showTeamWorkload: readBooleanOverride(moduleOverrides, "showTeamWorkload", defaults.sections.showTeamWorkload),
    },
  };
}

export function resolveCalendarCapabilities(user: AuthenticatedUser | null): CalendarCapabilities {
  const access = resolveAccess(user);
  const defaults = resolveCalendarCapabilitiesFromDefaults(user);
  const moduleOverrides = readRoleModuleOverrides(access, "calendar");

  if (!moduleOverrides) {
    return defaults;
  }

  return {
    canViewCalendar: readBooleanOverride(moduleOverrides, "canViewCalendar", defaults.canViewCalendar),
    canViewDailyAgenda: readBooleanOverride(moduleOverrides, "canViewDailyAgenda", defaults.canViewDailyAgenda),
    canViewTeamCalendar: readBooleanOverride(moduleOverrides, "canViewTeamCalendar", defaults.canViewTeamCalendar),
  };
}

export function resolveActivitiesCapabilities(user: AuthenticatedUser | null): ActivitiesCapabilities {
  const access = resolveAccess(user);
  const defaults = resolveActivitiesCapabilitiesFromDefaults(user);
  const moduleOverrides = readRoleModuleOverrides(access, "activities");

  if (!moduleOverrides) {
    return {
      ...defaults,
      canExportData: defaults.canExportData && canExportByRole(access),
    };
  }

  return {
    canViewActivities: readBooleanOverride(moduleOverrides, "canViewActivities", defaults.canViewActivities),
    canCreateActivity: readBooleanOverride(moduleOverrides, "canCreateActivity", defaults.canCreateActivity),
    canChangeResponsible: readBooleanOverride(moduleOverrides, "canChangeResponsible", defaults.canChangeResponsible),
    canDeleteActivity: readBooleanOverride(moduleOverrides, "canDeleteActivity", defaults.canDeleteActivity),
    canReorderPhases: readBooleanOverride(moduleOverrides, "canReorderPhases", defaults.canReorderPhases),
    canExportData: readBooleanOverride(moduleOverrides, "canExportData", defaults.canExportData) && canExportByRole(access),
    statusScope: readEnumOverride({
      moduleState: moduleOverrides,
      key: "statusScope",
      allowed: ["all", "assigned_or_participant", "none"],
      fallback: defaults.statusScope,
    }),
  };
}

export function resolveProjectsCapabilities(user: AuthenticatedUser | null): ProjectsCapabilities {
  const access = resolveAccess(user);
  const defaults = resolveProjectsCapabilitiesFromDefaults(user);
  const moduleOverrides = readRoleModuleOverrides(access, "projects");

  if (!moduleOverrides) {
    return {
      ...defaults,
      canExportData: defaults.canExportData && canExportByRole(access),
    };
  }

  return {
    canViewProjects: readBooleanOverride(moduleOverrides, "canViewProjects", defaults.canViewProjects),
    canCreateProject: readBooleanOverride(moduleOverrides, "canCreateProject", defaults.canCreateProject),
    canEditProjectGeneral: readBooleanOverride(moduleOverrides, "canEditProjectGeneral", defaults.canEditProjectGeneral),
    canChangeProjectStage: readBooleanOverride(moduleOverrides, "canChangeProjectStage", defaults.canChangeProjectStage),
    canArchiveProject: readBooleanOverride(moduleOverrides, "canArchiveProject", defaults.canArchiveProject),
    canDeleteProject: readBooleanOverride(moduleOverrides, "canDeleteProject", defaults.canDeleteProject),
    canEditProtectedProjectData: readBooleanOverride(moduleOverrides, "canEditProtectedProjectData", defaults.canEditProtectedProjectData),
    canExportData: readBooleanOverride(moduleOverrides, "canExportData", defaults.canExportData) && canExportByRole(access),
  };
}

export function resolveResourcesCapabilities(user: AuthenticatedUser | null): ResourcesCapabilities {
  const access = resolveAccess(user);
  const defaults = resolveResourcesCapabilitiesFromDefaults(user);
  const resourcesOverrides = readRoleModuleOverrides(access, "resources");
  const enterpriseOverrides = readRoleModuleOverrides(access, "enterprise");

  if (!resourcesOverrides && !enterpriseOverrides) {
    return defaults;
  }

  return {
    canViewResources: readBooleanOverride(resourcesOverrides, "canViewResources", defaults.canViewResources),
    canManageFavoritesSection: readBooleanOverride(resourcesOverrides, "canManageFavoritesSection", defaults.canManageFavoritesSection),
    enterprise: {
      canView: readBooleanOverride(enterpriseOverrides, "enterprise.canView", defaults.enterprise.canView),
      canCreate: readBooleanOverride(enterpriseOverrides, "enterprise.canCreate", defaults.enterprise.canCreate),
      canEdit: readBooleanOverride(enterpriseOverrides, "enterprise.canEdit", defaults.enterprise.canEdit),
      canDelete: readBooleanOverride(enterpriseOverrides, "enterprise.canDelete", defaults.enterprise.canDelete),
      canCreateCategory: readBooleanOverride(enterpriseOverrides, "enterprise.canCreateCategory", defaults.enterprise.canCreateCategory),
    },
    corporate: {
      canCreate: readBooleanOverride(resourcesOverrides, "corporate.canCreate", defaults.corporate.canCreate),
      canDelete: readBooleanOverride(resourcesOverrides, "corporate.canDelete", defaults.corporate.canDelete),
      editScope: readEnumOverride({
        moduleState: resourcesOverrides,
        key: "corporate.editScope",
        allowed: ["all", "owned_or_personal", "none"],
        fallback: defaults.corporate.editScope,
      }),
    },
  };
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
  const access = resolveAccess(user);
  const defaults = resolveClientsCapabilitiesFromDefaults(user);
  const moduleOverrides = readRoleModuleOverrides(access, "clients");

  if (!moduleOverrides) {
    return {
      ...defaults,
      canExportData: defaults.canExportData && canExportByRole(access),
    };
  }

  return {
    canViewClients: readBooleanOverride(moduleOverrides, "canViewClients", defaults.canViewClients),
    canCreateClient: readBooleanOverride(moduleOverrides, "canCreateClient", defaults.canCreateClient),
    canEditClient: readBooleanOverride(moduleOverrides, "canEditClient", defaults.canEditClient),
    canDeleteClient: readBooleanOverride(moduleOverrides, "canDeleteClient", defaults.canDeleteClient),
    canExportData: readBooleanOverride(moduleOverrides, "canExportData", defaults.canExportData) && canExportByRole(access),
  };
}

export function resolveTeamCapabilities(user: AuthenticatedUser | null): TeamCapabilities {
  const access = resolveAccess(user);
  const defaults = resolveTeamCapabilitiesFromDefaults(user);
  const moduleOverrides = readRoleModuleOverrides(access, "team");

  if (!moduleOverrides) {
    return {
      ...defaults,
      canExportData: defaults.canExportData && canExportByRole(access),
    };
  }

  return {
    canViewTeam: readBooleanOverride(moduleOverrides, "canViewTeam", defaults.canViewTeam),
    canCreateCollaborator: readBooleanOverride(moduleOverrides, "canCreateCollaborator", defaults.canCreateCollaborator),
    canEditCollaborator: readBooleanOverride(moduleOverrides, "canEditCollaborator", defaults.canEditCollaborator),
    canChangeCollaboratorAccess: readBooleanOverride(
      moduleOverrides,
      "canChangeCollaboratorAccess",
      defaults.canChangeCollaboratorAccess
    ),
    canToggleCollaboratorActive: readBooleanOverride(moduleOverrides, "canToggleCollaboratorActive", defaults.canToggleCollaboratorActive),
    canDeleteCollaborator: readBooleanOverride(moduleOverrides, "canDeleteCollaborator", defaults.canDeleteCollaborator),
    canExportData: readBooleanOverride(moduleOverrides, "canExportData", defaults.canExportData) && canExportByRole(access),
  };
}

export function resolveAreasCapabilities(user: AuthenticatedUser | null): AreasCapabilities {
  const access = resolveAccess(user);
  const defaults = resolveAreasCapabilitiesFromDefaults(user);
  const moduleOverrides = readRoleModuleOverrides(access, "areas");

  if (!moduleOverrides) return defaults;

  return {
    canViewAreas: readBooleanOverride(moduleOverrides, "canViewAreas", defaults.canViewAreas),
    canManageAreas: readBooleanOverride(moduleOverrides, "canManageAreas", defaults.canManageAreas),
  };
}

export function resolveWorkflowsCapabilities(user: AuthenticatedUser | null): WorkflowsCapabilities {
  const access = resolveAccess(user);
  const defaults = resolveWorkflowsCapabilitiesFromDefaults(user);
  const moduleOverrides = readRoleModuleOverrides(access, "workflows");

  if (!moduleOverrides) return defaults;

  return {
    canViewWorkflows: readBooleanOverride(moduleOverrides, "canViewWorkflows", defaults.canViewWorkflows),
    canManageWorkflows: readBooleanOverride(moduleOverrides, "canManageWorkflows", defaults.canManageWorkflows),
  };
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
  viewerId,
}: {
  capabilities: ActivitiesCapabilities;
  task: TTask;
  viewerId: string;
}): boolean {
  if (capabilities.statusScope === "all") {
    return true;
  }

  if (capabilities.statusScope === "none") {
    return false;
  }

  if (!viewerId) {
    return false;
  }

  return taskBelongsToViewer(
    {
      project: { id: "", name: "" },
      manager: task.manager,
      support: task.support,
    },
    viewerId
  );
}

export function scopeDashboardProjects<TProject extends DashboardProjectShape, TTask extends DashboardTaskShape>({
  projects,
  tasks,
  viewerId,
  dataScope,
}: {
  projects: TProject[];
  tasks: TTask[];
  viewerId: string;
  dataScope: DashboardDataScope;
}): TProject[] {
  if (dataScope === "global") {
    return projects;
  }

  if (dataScope === "managed_projects") {
    return projects.filter((project) => projectIsManagedByViewer(project, viewerId));
  }

  const visibleProjectIds = new Set(
    tasks.filter((task) => taskBelongsToViewer(task, viewerId)).map((task) => task.project.id)
  );

  return projects.filter((project) => visibleProjectIds.has(project.id));
}

export function scopeDashboardTasks<TTask extends DashboardTaskShape>({
  tasks,
  viewerId,
  dataScope,
  allowedProjectIds,
}: {
  tasks: TTask[];
  viewerId: string;
  dataScope: DashboardDataScope;
  allowedProjectIds: Set<string>;
}): TTask[] {
  if (dataScope === "assigned_tasks") {
    return tasks.filter((task) => allowedProjectIds.has(task.project.id) && taskBelongsToViewer(task, viewerId));
  }

  return tasks.filter((task) => allowedProjectIds.has(task.project.id));
}