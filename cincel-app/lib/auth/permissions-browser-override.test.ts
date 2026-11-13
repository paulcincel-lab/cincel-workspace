// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import * as permissions from "@/lib/auth/permissions";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";

/**
 * #950: the matrix the old Ajustes › Permisos editor saved in the browser
 * enforced nothing on the server, so the client resolvers ignore it and
 * client gating equals server gating.
 */

const LEGACY_MATRIX_KEY = "cincel.permissions.custom.v1";

const RESOLVERS = [
  "resolveDashboardCapabilities",
  "resolveCalendarCapabilities",
  "resolveActivitiesCapabilities",
  "resolveProjectsCapabilities",
  "resolveResourcesCapabilities",
  "resolveClientsCapabilities",
  "resolveTeamCapabilities",
  "resolveTaskStatusesCapabilities",
  "resolvePositionsCapabilities",
  "resolveWorkflowsCapabilities",
  "resolvePortalCapabilities",
] as const;

function user(access: SystemAccessRole): AuthenticatedUser {
  return {
    member: {
      id: "00000000-0000-0000-0000-000000000999",
      name: "Prueba",
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "prueba@example.test",
      phone: "",
    },
    email: "prueba@example.test",
    access,
  } as AuthenticatedUser;
}

/** Everything turned on (and every scope widened) for every role and module. */
function everythingOn(): string {
  const modules = {
    dashboard: { dataScope: "global", showProjectAssignments: true, showProjectRisk: true, showTeamWorkload: true },
    calendar: { canViewCalendar: true, canViewDailyAgenda: true, canViewTeamCalendar: true },
    activities: { canViewActivities: true, canCreateActivity: true, canDeleteActivity: true, statusScope: "all" },
    projects: { canViewProjects: true, canCreateProject: true, canDeleteProject: true },
    resources: { canViewResources: true, "corporate.canDelete": true, "corporate.editScope": "all" },
    enterprise: { "enterprise.canDelete": true },
    clients: { canViewClients: true, canDeleteClient: true },
    team: { canViewTeam: true, canDeleteCollaborator: true, canChangeCollaboratorAccess: true },
    taskStatuses: { canManageTaskStatuses: true },
    positions: { canManagePositions: true },
    workflows: { canManageWorkflows: true },
    portal: { manageAccess: true, disableUsers: true },
  };
  return JSON.stringify({ version: 1, roles: Object.fromEntries(SYSTEM_ACCESS_ROLES.map((role) => [role, modules])) });
}

afterEach(() => {
  window.localStorage.clear();
});

describe("client capability resolvers ignore the browser-only matrix", () => {
  it.each(SYSTEM_ACCESS_ROLES)("%s: every resolver returns the same with and without a stored matrix", (role) => {
    const viewer = user(role);
    const clean = RESOLVERS.map((name) => permissions[name](viewer));

    window.localStorage.setItem(LEGACY_MATRIX_KEY, everythingOn());
    const withStored = RESOLVERS.map((name) => permissions[name](viewer));

    expect(withStored).toEqual(clean);
  });

  it("a Colaborador still cannot manage task statuses, puestos or etapas with the matrix stored", () => {
    window.localStorage.setItem(LEGACY_MATRIX_KEY, everythingOn());
    const viewer = user("Colaborador");
    expect(permissions.resolveTaskStatusesCapabilities(viewer).canManageTaskStatuses).toBe(false);
    expect(permissions.resolvePositionsCapabilities(viewer).canManagePositions).toBe(false);
    expect(permissions.resolveWorkflowsCapabilities(viewer).canManageWorkflows).toBe(false);
  });
});
