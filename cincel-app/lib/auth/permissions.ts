import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { SYSTEM_ACCESS_ROLES, isAdministratorRole, type SystemAccessRole } from "@/lib/data/roles";
import type { ResourceSection } from "@/lib/types/resource";

/**
 * The overrides of one access role's permission matrix (Ajustes › Permisos,
 * #971): module id → capability key → value, only where the saved matrix
 * differs from the defaults below. The server reads them from
 * `core.role_permissions` once per request and puts them on the session user
 * (`AuthenticatedUser.permissionOverrides`), so the server checks and the
 * client gating run the same resolvers over the same values.
 */
export type PermissionOverrides = Readonly<Record<string, Readonly<Record<string, boolean | string>>>>;

/** Roles whose permissions are fixed: full access, never edited and never overridden. */
export const PROTECTED_PERMISSION_ROLES: readonly SystemAccessRole[] = ["Administrador"];

export function isProtectedPermissionRole(role: SystemAccessRole): boolean {
  return PROTECTED_PERMISSION_ROLES.includes(role);
}

/** Modules whose `canExportData` is capped to Administrador and Dirección whatever the matrix says. */
const EXPORT_CAPPED_MODULES: ReadonlySet<string> = new Set(["activities", "projects", "clients", "team"]);

/**
 * A capability the matrix cannot change for this role: every capability of a
 * protected role, and the capped data export for roles other than
 * Administrador and Dirección.
 */
export function isPermissionLocked(role: SystemAccessRole, moduleId: string, key: string): boolean {
  if (isProtectedPermissionRole(role)) return true;
  return key === "canExportData" && EXPORT_CAPPED_MODULES.has(moduleId) && !canExportByRole(role);
}

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
 * Puestos (`core.positions`, `core.staff_positions`, `core.position_phases`)
 * are a company-structure admin surface: everyone can see them (staff
 * pickers, task assignment) but only Administrador / Dirección manage them.
 */
export type PositionsCapabilities = {
  canViewPositions: boolean;
  canManagePositions: boolean;
};

/**
 * Custom task statuses (`core.task_statuses`): everyone sees them in task
 * pickers, only Administrador / Dirección manage the catalog.
 */
export type TaskStatusesCapabilities = {
  canViewTaskStatuses: boolean;
  canManageTaskStatuses: boolean;
};

/**
 * Workflows and their task templates (`core.workflows`,
 * `core.workflow_task_templates`) are the other half of the "method" admin
 * surface — same view-all / manage-admin-only shape as puestos.
 */
export type WorkflowsCapabilities = {
  canViewWorkflows: boolean;
  canManageWorkflows: boolean;
};

/**
 * Client portal access (BE §B.5). Stored under module id "portal", so the keys
 * read as `portal.manageAccess` / `portal.disableUsers`. Defaults per BE §0.3,
 * still pending client confirmation.
 */
export type PortalCapabilities = {
  /** Invite, resend, revoke, see the Clientes tab and its activity. */
  manageAccess: boolean;
  /** Disable or re-enable a portal user. */
  disableUsers: boolean;
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

const POSITIONS_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, PositionsCapabilities> = Object.fromEntries(
  SYSTEM_ACCESS_ROLES.map((role) => [
    role,
    { canViewPositions: true, canManagePositions: canManageCompanyStructureByRole(role) },
  ])
) as Record<SystemAccessRole, PositionsCapabilities>;

const TASK_STATUSES_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, TaskStatusesCapabilities> =
  Object.fromEntries(
    SYSTEM_ACCESS_ROLES.map((role) => [
      role,
      { canViewTaskStatuses: true, canManageTaskStatuses: canManageCompanyStructureByRole(role) },
    ])
  ) as Record<SystemAccessRole, TaskStatusesCapabilities>;

const WORKFLOWS_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, WorkflowsCapabilities> = Object.fromEntries(
  SYSTEM_ACCESS_ROLES.map((role) => [
    role,
    { canViewWorkflows: true, canManageWorkflows: canManageCompanyStructureByRole(role) },
  ])
) as Record<SystemAccessRole, WorkflowsCapabilities>;

const PORTAL_MANAGE_ACCESS_ROLES: readonly SystemAccessRole[] = [
  "Administrador",
  "Dirección",
  "Jefe de Taller",
  "Jefe de Construcción",
];

const PORTAL_CAPABILITIES_BY_ROLE: Record<SystemAccessRole, PortalCapabilities> = Object.fromEntries(
  SYSTEM_ACCESS_ROLES.map((role) => [
    role,
    { manageAccess: PORTAL_MANAGE_ACCESS_ROLES.includes(role), disableUsers: role === "Administrador" },
  ])
) as Record<SystemAccessRole, PortalCapabilities>;

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

type CapabilityTree = { [key: string]: boolean | string | CapabilityTree };

/**
 * The defaults with the viewer's matrix overrides applied. `moduleIds` are the
 * registry modules that write into these capabilities; a key is a dotted path
 * into them unless `paths` maps it. A value whose type differs from the
 * default's, an unknown key and any override of a protected role are ignored.
 */
function withOverrides<T extends object>(
  defaults: T,
  user: AuthenticatedUser | null,
  moduleIds: readonly string[],
  paths: Readonly<Record<string, string>> = {},
): T {
  const overrides = user?.permissionOverrides;
  if (!overrides || !user || isProtectedPermissionRole(user.access)) return defaults;

  let next: CapabilityTree | null = null;
  for (const moduleId of moduleIds) {
    const values = overrides[moduleId];
    if (!values) continue;
    for (const [key, value] of Object.entries(values)) {
      if (isPermissionLocked(user.access, moduleId, key)) continue;
      const path = (paths[key] ?? key).split(".");
      const leaf = path.pop()!;
      let source: CapabilityTree | undefined = defaults as unknown as CapabilityTree;
      for (const part of path) {
        const child: boolean | string | CapabilityTree | undefined = source?.[part];
        source = typeof child === "object" ? child : undefined;
      }
      if (!source || !(leaf in source) || typeof source[leaf] !== typeof value) continue;

      next ??= JSON.parse(JSON.stringify(defaults)) as CapabilityTree;
      let target: CapabilityTree = next;
      for (const part of path) target = target[part] as CapabilityTree;
      target[leaf] = value;
    }
  }
  return (next as T | null) ?? defaults;
}

const DASHBOARD_KEY_PATHS: Readonly<Record<string, string>> = {
  showProjectAssignments: "sections.showProjectAssignments",
  showProjectRisk: "sections.showProjectRisk",
  showTeamWorkload: "sections.showTeamWorkload",
};

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

export function resolvePositionsCapabilitiesFromDefaults(user: AuthenticatedUser | null): PositionsCapabilities {
  const access = resolveAccess(user);
  return POSITIONS_CAPABILITIES_BY_ROLE[access];
}

export function resolveWorkflowsCapabilitiesFromDefaults(user: AuthenticatedUser | null): WorkflowsCapabilities {
  const access = resolveAccess(user);
  return WORKFLOWS_CAPABILITIES_BY_ROLE[access];
}

export function resolveDashboardCapabilities(user: AuthenticatedUser | null): DashboardCapabilities {
  return withOverrides(resolveDashboardCapabilitiesFromDefaults(user), user, ["dashboard"], DASHBOARD_KEY_PATHS);
}

export function resolveCalendarCapabilities(user: AuthenticatedUser | null): CalendarCapabilities {
  return withOverrides(resolveCalendarCapabilitiesFromDefaults(user), user, ["calendar"]);
}

export function resolveActivitiesCapabilities(user: AuthenticatedUser | null): ActivitiesCapabilities {
  const access = resolveAccess(user);
  const defaults = withOverrides(resolveActivitiesCapabilitiesFromDefaults(user), user, ["activities"]);
  return { ...defaults, canExportData: defaults.canExportData && canExportByRole(access) };
}

export function resolveProjectsCapabilities(user: AuthenticatedUser | null): ProjectsCapabilities {
  const access = resolveAccess(user);
  const defaults = withOverrides(resolveProjectsCapabilitiesFromDefaults(user), user, ["projects"]);
  return { ...defaults, canExportData: defaults.canExportData && canExportByRole(access) };
}

export function resolveResourcesCapabilities(user: AuthenticatedUser | null): ResourcesCapabilities {
  return withOverrides(resolveResourcesCapabilitiesFromDefaults(user), user, ["resources", "enterprise"]);
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
  const defaults = withOverrides(resolveClientsCapabilitiesFromDefaults(user), user, ["clients"]);
  return { ...defaults, canExportData: defaults.canExportData && canExportByRole(access) };
}

export function resolveTeamCapabilities(user: AuthenticatedUser | null): TeamCapabilities {
  const access = resolveAccess(user);
  const defaults = withOverrides(resolveTeamCapabilitiesFromDefaults(user), user, ["team"]);
  return { ...defaults, canExportData: defaults.canExportData && canExportByRole(access) };
}

export function resolveTaskStatusesCapabilitiesFromDefaults(
  user: AuthenticatedUser | null
): TaskStatusesCapabilities {
  return TASK_STATUSES_CAPABILITIES_BY_ROLE[resolveAccess(user)];
}

export function resolveTaskStatusesCapabilities(user: AuthenticatedUser | null): TaskStatusesCapabilities {
  return withOverrides(resolveTaskStatusesCapabilitiesFromDefaults(user), user, ["taskStatuses"]);
}

/** Puestos capabilities. */
export function resolvePositionsCapabilities(user: AuthenticatedUser | null): PositionsCapabilities {
  return withOverrides(resolvePositionsCapabilitiesFromDefaults(user), user, ["positions"]);
}

export function resolveWorkflowsCapabilities(user: AuthenticatedUser | null): WorkflowsCapabilities {
  return withOverrides(resolveWorkflowsCapabilitiesFromDefaults(user), user, ["workflows"]);
}

export function resolvePortalCapabilitiesFromDefaults(user: AuthenticatedUser | null): PortalCapabilities {
  return PORTAL_CAPABILITIES_BY_ROLE[resolveAccess(user)];
}

export function resolvePortalCapabilities(user: AuthenticatedUser | null): PortalCapabilities {
  return withOverrides(resolvePortalCapabilitiesFromDefaults(user), user, ["portal"]);
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
  viewerId = null,
  ownerId = null,
  personalForId = null,
}: {
  capabilities: ResourcesCapabilities;
  section: ResourceSection;
  viewerId?: string | null;
  ownerId?: string | null;
  personalForId?: string | null;
}): boolean {
  if (isCorporateResourcesSection(section)) {
    if (capabilities.corporate.editScope === "all") {
      return true;
    }

    if (capabilities.corporate.editScope === "none") {
      return false;
    }

    if (viewerId === null) {
      return false;
    }

    return ownerId === viewerId || personalForId === viewerId;
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

/**
 * Staff PII (CURP, RFC, address, emergency contact…) is visible to global
 * admins only: Administrador or Dirección. Project-scoped roles never see
 * other members' personal data.
 */
export function canViewSensitiveStaffData(user: AuthenticatedUser | null): boolean {
  if (!user) return false;
  return isAdministratorRole(user.member.role) || user.access === "Dirección";
}

// ── Redesign capabilities (BE §12.1). ──

/** Company-wide appearance (Ajustes › Tema) applies to everyone: access "Administrador" only. */
export function canManageAppearance(user: AuthenticatedUser | null): boolean {
  return user?.access === "Administrador";
}

/** General settings (Ajustes › General): today's rule, `canViewSensitiveStaffData`. */
export function canManageGeneralSettings(user: AuthenticatedUser | null): boolean {
  return canViewSensitiveStaffData(user);
}

/** Control de horario settings: access "Administrador". */
export function canManageTimeTracking(user: AuthenticatedUser | null): boolean {
  return user?.access === "Administrador";
}

/** Team hours report and CSV export: access "Administrador" or "Dirección". */
export function canViewTeamHours(user: AuthenticatedUser | null): boolean {
  return user?.access === "Administrador" || user?.access === "Dirección";
}

/** Vacation decisions and settings: access "Administrador" or "Dirección" (never one's own request). */
export function canDecideVacations(user: AuthenticatedUser | null): boolean {
  return user?.access === "Administrador" || user?.access === "Dirección";
}

/**
 * Admin-only project flow data (client, origin, admin tasks, "Asignar tramo",
 * the auto-start checkbox): access "Administrador" only; "Dirección" doesn't
 * count (FE §8, RD-3). Server actions and DTOs enforce the same rule.
 */
export function canSeeAdminData(user: AuthenticatedUser | null | undefined): boolean {
  return user?.access === "Administrador";
}
