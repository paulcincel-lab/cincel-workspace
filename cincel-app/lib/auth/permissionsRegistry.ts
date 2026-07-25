import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  resolveActivitiesCapabilitiesFromDefaults,
  type ActivitiesCapabilities,
  resolveCalendarCapabilitiesFromDefaults,
  type CalendarCapabilities,
  resolveClientsCapabilitiesFromDefaults,
  type ClientsCapabilities,
  resolveDashboardCapabilitiesFromDefaults,
  type DashboardCapabilities,
  resolveProjectsCapabilitiesFromDefaults,
  type ProjectsCapabilities,
  resolveResourcesCapabilitiesFromDefaults,
  type ResourcesCapabilities,
  resolveTeamCapabilitiesFromDefaults,
  type TeamCapabilities,
} from "@/lib/auth/permissions";

export type PermissionValue = boolean | string;

export type PermissionActionDefinition = {
  id: string;
  label: string;
  type: "boolean" | "select";
  options?: Array<{ value: string; label: string }>;
  getValue: (capabilities: unknown) => PermissionValue;
};

export type PermissionsModuleDefinition = {
  id: string;
  name: string;
  order: number;
  resolver: (user: AuthenticatedUser | null) => unknown;
  detailsLabel?: string;
  detailsValueLabel?: (values: Record<string, PermissionValue>) => string;
  actions: PermissionActionDefinition[];
  isEnabled: (values: Record<string, PermissionValue>) => boolean;
};

export const PERMISSIONS_MODULES_REGISTRY = ([
  {
    id: "dashboard",
    name: "Dashboard",
    order: 1,
    resolver: resolveDashboardCapabilitiesFromDefaults,
    detailsLabel: "Alcance de datos",
    detailsValueLabel: (values) => {
      if (values.dataScope === "global") {
        return "Todos los proyectos";
      }

      if (values.dataScope === "managed_projects") {
        return "Solo proyectos gestionados";
      }

      return "Solo proyectos asignados";
    },
    actions: [
      {
        id: "dataScope",
        label: "Alcance de datos",
        type: "select",
        options: [
          { value: "global", label: "Todos los proyectos" },
          { value: "managed_projects", label: "Solo proyectos gestionados" },
          { value: "assigned_tasks", label: "Solo proyectos asignados" },
        ],
        getValue: (capabilities) => (capabilities as DashboardCapabilities).dataScope,
      },
      {
        id: "showProjectAssignments",
        label: "Ver asignaciones de proyecto",
        type: "boolean",
        getValue: (capabilities) => (capabilities as DashboardCapabilities).sections.showProjectAssignments,
      },
      {
        id: "showProjectRisk",
        label: "Ver riesgo de proyecto",
        type: "boolean",
        getValue: (capabilities) => (capabilities as DashboardCapabilities).sections.showProjectRisk,
      },
      {
        id: "showTeamWorkload",
        label: "Ver carga del equipo",
        type: "boolean",
        getValue: (capabilities) => (capabilities as DashboardCapabilities).sections.showTeamWorkload,
      },
    ],
    isEnabled: () => true,
  },
  {
    id: "activities",
    name: "Actividades",
    order: 2,
    resolver: resolveActivitiesCapabilitiesFromDefaults,
    detailsLabel: "Cambio de estado",
    detailsValueLabel: (values) => {
      if (values.statusScope === "all") {
        return "Todas las actividades";
      }

      if (values.statusScope === "assigned_or_participant") {
        return "Solo actividades asignadas o donde participa";
      }

      return "Sin cambio de estado";
    },
    actions: [
      {
        id: "canViewActivities",
        label: "Ver actividades",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ActivitiesCapabilities).canViewActivities,
      },
      {
        id: "canCreateActivity",
        label: "Crear actividad",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ActivitiesCapabilities).canCreateActivity,
      },
      {
        id: "canChangeResponsible",
        label: "Cambiar responsable",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ActivitiesCapabilities).canChangeResponsible,
      },
      {
        id: "canDeleteActivity",
        label: "Eliminar actividad",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ActivitiesCapabilities).canDeleteActivity,
      },
      {
        id: "canReorderPhases",
        label: "Reordenar fases",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ActivitiesCapabilities).canReorderPhases,
      },
      {
        id: "statusScope",
        label: "Alcance de cambio de estado",
        type: "select",
        options: [
          { value: "all", label: "Todas las actividades" },
          { value: "assigned_or_participant", label: "Solo asignadas o donde participa" },
          { value: "none", label: "Sin cambio de estado" },
        ],
        getValue: (capabilities) => (capabilities as ActivitiesCapabilities).statusScope,
      },
    ],
    isEnabled: (values) => values.canViewActivities === true,
  },
  {
    id: "calendar",
    name: "Calendario",
    order: 3,
    resolver: resolveCalendarCapabilitiesFromDefaults,
    actions: [
      {
        id: "canViewCalendar",
        label: "Ver calendario",
        type: "boolean",
        getValue: (capabilities) => (capabilities as CalendarCapabilities).canViewCalendar,
      },
      {
        id: "canViewDailyAgenda",
        label: "Ver agenda diaria",
        type: "boolean",
        getValue: (capabilities) => (capabilities as CalendarCapabilities).canViewDailyAgenda,
      },
      {
        id: "canViewTeamCalendar",
        label: "Ver calendario del equipo",
        type: "boolean",
        getValue: (capabilities) => (capabilities as CalendarCapabilities).canViewTeamCalendar,
      },
    ],
    isEnabled: (values) => values.canViewCalendar === true,
  },
  {
    id: "resources",
    name: "Recursos",
    order: 4,
    resolver: resolveResourcesCapabilitiesFromDefaults,
    detailsLabel: "Edición corporativa",
    detailsValueLabel: (values) => {
      if (values["corporate.editScope"] === "all") {
        return "Recursos corporativos y personales";
      }

      if (values["corporate.editScope"] === "owned_or_personal") {
        return "Solo recursos personales";
      }

      return "Sin edición";
    },
    actions: [
      {
        id: "canViewResources",
        label: "Ver recursos",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).canViewResources,
      },
      {
        id: "canManageFavoritesSection",
        label: "Gestionar Mis Favoritos",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).canManageFavoritesSection,
      },
      {
        id: "corporate.canCreate",
        label: "Subir en recursos corporativos",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).corporate.canCreate,
      },
      {
        id: "corporate.canDelete",
        label: "Eliminar en recursos corporativos",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).corporate.canDelete,
      },
      {
        id: "corporate.editScope",
        label: "Alcance de edición",
        type: "select",
        options: [
          { value: "all", label: "Recursos corporativos y personales" },
          { value: "owned_or_personal", label: "Solo recursos personales" },
          { value: "none", label: "Sin edición" },
        ],
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).corporate.editScope,
      },
    ],
    isEnabled: (values) => values.canViewResources === true,
  },
  {
    id: "enterprise",
    name: "Empresa",
    order: 5,
    resolver: resolveResourcesCapabilitiesFromDefaults,
    actions: [
      {
        id: "enterprise.canView",
        label: "Ver Empresa",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).enterprise.canView,
      },
      {
        id: "enterprise.canCreate",
        label: "Subir documento",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).enterprise.canCreate,
      },
      {
        id: "enterprise.canEdit",
        label: "Editar documento",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).enterprise.canEdit,
      },
      {
        id: "enterprise.canDelete",
        label: "Eliminar documento",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).enterprise.canDelete,
      },
      {
        id: "enterprise.canCreateCategory",
        label: "Crear categoria",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ResourcesCapabilities).enterprise.canCreateCategory,
      },
    ],
    isEnabled: (values) => values["enterprise.canView"] === true,
  },
  {
    id: "projects",
    name: "Proyectos",
    order: 6,
    resolver: resolveProjectsCapabilitiesFromDefaults,
    actions: [
      {
        id: "canViewProjects",
        label: "Ver proyectos",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ProjectsCapabilities).canViewProjects,
      },
      {
        id: "canCreateProject",
        label: "Crear proyecto",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ProjectsCapabilities).canCreateProject,
      },
      {
        id: "canEditProjectGeneral",
        label: "Editar datos generales",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ProjectsCapabilities).canEditProjectGeneral,
      },
      {
        id: "canChangeProjectStage",
        label: "Cambiar etapa",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ProjectsCapabilities).canChangeProjectStage,
      },
      {
        id: "canArchiveProject",
        label: "Archivar proyecto",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ProjectsCapabilities).canArchiveProject,
      },
      {
        id: "canDeleteProject",
        label: "Eliminar proyecto",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ProjectsCapabilities).canDeleteProject,
      },
      {
        id: "canEditProtectedProjectData",
        label: "Editar datos protegidos",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ProjectsCapabilities).canEditProtectedProjectData,
      },
    ],
    isEnabled: (values) => values.canViewProjects === true,
  },
  {
    id: "clients",
    name: "Clientes",
    order: 7,
    resolver: resolveClientsCapabilitiesFromDefaults,
    actions: [
      {
        id: "canViewClients",
        label: "Ver clientes",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ClientsCapabilities).canViewClients,
      },
      {
        id: "canCreateClient",
        label: "Crear cliente",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ClientsCapabilities).canCreateClient,
      },
      {
        id: "canEditClient",
        label: "Editar cliente",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ClientsCapabilities).canEditClient,
      },
      {
        id: "canDeleteClient",
        label: "Eliminar cliente",
        type: "boolean",
        getValue: (capabilities) => (capabilities as ClientsCapabilities).canDeleteClient,
      },
    ],
    isEnabled: (values) => values.canViewClients === true,
  },
  {
    id: "team",
    name: "Equipo",
    order: 8,
    resolver: resolveTeamCapabilitiesFromDefaults,
    actions: [
      {
        id: "canViewTeam",
        label: "Ver colaboradores",
        type: "boolean",
        getValue: (capabilities) => (capabilities as TeamCapabilities).canViewTeam,
      },
      {
        id: "canCreateCollaborator",
        label: "Crear colaborador",
        type: "boolean",
        getValue: (capabilities) => (capabilities as TeamCapabilities).canCreateCollaborator,
      },
      {
        id: "canEditCollaborator",
        label: "Editar colaborador",
        type: "boolean",
        getValue: (capabilities) => (capabilities as TeamCapabilities).canEditCollaborator,
      },
      {
        id: "canChangeCollaboratorAccess",
        label: "Cambiar acceso",
        type: "boolean",
        getValue: (capabilities) => (capabilities as TeamCapabilities).canChangeCollaboratorAccess,
      },
      {
        id: "canToggleCollaboratorActive",
        label: "Activar / Desactivar",
        type: "boolean",
        getValue: (capabilities) => (capabilities as TeamCapabilities).canToggleCollaboratorActive,
      },
      {
        id: "canDeleteCollaborator",
        label: "Eliminar colaborador",
        type: "boolean",
        getValue: (capabilities) => (capabilities as TeamCapabilities).canDeleteCollaborator,
      },
    ],
    isEnabled: (values) => values.canViewTeam === true,
  },
] satisfies PermissionsModuleDefinition[]).sort((a, b) => a.order - b.order);
