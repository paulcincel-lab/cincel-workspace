// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import * as permissions from "@/lib/auth/permissions";
import { isPermissionLocked, type PermissionOverrides } from "@/lib/auth/permissions";
import { PERMISSIONS_MODULES_REGISTRY, type PermissionValue } from "@/lib/auth/permissionsRegistry";
import {
  buildDefaultPermissionsState,
  buildPermissionsMatrix,
  describePermissionChanges,
  findInvalidPermissionCell,
  rowsFromPermissionsState,
  type PermissionsState,
} from "@/lib/auth/permissionsState";
import type { SessionAccess } from "@/lib/auth/session";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";
import { selectAuthenticatedUser, sessionIdentityKey } from "@/lib/stores/session-store";

/**
 * The server-stored matrix (#971): saved rows become overrides, the
 * resolvers apply them, and the client mirror of the session resolves the
 * same capabilities as the server for every role.
 */

/** The resolver the app calls for each registry module (the enforced one, not `…FromDefaults`). */
const ENFORCED: Record<string, (user: AuthenticatedUser | null) => unknown> = {
  dashboard: permissions.resolveDashboardCapabilities,
  activities: permissions.resolveActivitiesCapabilities,
  calendar: permissions.resolveCalendarCapabilities,
  resources: permissions.resolveResourcesCapabilities,
  enterprise: permissions.resolveResourcesCapabilities,
  projects: permissions.resolveProjectsCapabilities,
  clients: permissions.resolveClientsCapabilities,
  team: permissions.resolveTeamCapabilities,
  positions: permissions.resolvePositionsCapabilities,
  taskStatuses: permissions.resolveTaskStatusesCapabilities,
  workflows: permissions.resolveWorkflowsCapabilities,
  portal: permissions.resolvePortalCapabilities,
};

const DEFAULTS = buildDefaultPermissionsState();

/** Every cell flipped: booleans negated, selects moved to another option. */
function everythingFlipped(): PermissionsState {
  const out = {} as PermissionsState;
  for (const role of SYSTEM_ACCESS_ROLES) {
    out[role] = {};
    for (const moduleDefinition of PERMISSIONS_MODULES_REGISTRY) {
      const values: Record<string, PermissionValue> = {};
      for (const action of moduleDefinition.actions) {
        const current = DEFAULTS[role][moduleDefinition.id]![action.id]!;
        if (action.type === "boolean") values[action.id] = !current;
        else values[action.id] = action.options!.find((option) => option.value !== current)!.value;
      }
      out[role][moduleDefinition.id] = values;
    }
  }
  return out;
}

function sessionAccessFor(role: SystemAccessRole, overrides: PermissionOverrides | undefined): SessionAccess {
  return {
    status: "active",
    user: {
      id: "00000000-0000-0000-0000-000000000971",
      name: "Prueba",
      email: "prueba@example.test",
      role,
      area: null,
      active: true,
      mustChangePassword: false,
      googleLinked: false,
      access: role,
      ...(overrides ? { permissionOverrides: overrides } : {}),
    },
  };
}

/** What `requireCapabilityUser()` builds from the same session user (lib/auth/session.ts `toCapabilityUser`). */
function serverUser(access: SessionAccess): AuthenticatedUser {
  const user = access.user!;
  return {
    member: {
      id: user.id,
      name: user.name,
      role: user.role ?? "",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: user.email ?? "",
      phone: "",
    },
    email: user.email ?? "",
    access: user.access,
    ...(user.permissionOverrides ? { permissionOverrides: user.permissionOverrides } : {}),
  };
}

function resolvedState(user: AuthenticatedUser): PermissionsState[SystemAccessRole] {
  const out: PermissionsState[SystemAccessRole] = {};
  for (const moduleDefinition of PERMISSIONS_MODULES_REGISTRY) {
    const capabilities = ENFORCED[moduleDefinition.id]!(user);
    out[moduleDefinition.id] = Object.fromEntries(
      moduleDefinition.actions.map((action) => [action.id, action.getValue(capabilities)]),
    );
  }
  return out;
}

describe("buildPermissionsMatrix", () => {
  it("keeps only valid, unlocked cells that differ from the default", () => {
    const matrix = buildPermissionsMatrix([
      { role: "Colaborador", moduleId: "projects", key: "canCreateProject", value: true },
      { role: "Colaborador", moduleId: "projects", key: "canViewProjects", value: true }, // the default
      { role: "Administrador", moduleId: "projects", key: "canDeleteProject", value: false }, // protected
      { role: "Colaborador", moduleId: "projects", key: "canExportData", value: true }, // capped export
      { role: "Colaborador", moduleId: "dashboard", key: "dataScope", value: "everything" }, // not an option
      { role: "Colaborador", moduleId: "projects", key: "canFly", value: true }, // unknown key
      { role: "Cliente", moduleId: "projects", key: "canCreateProject", value: true }, // unknown role
      { role: "Dirección", moduleId: "team", key: "canDeleteCollaborator", value: "yes" }, // wrong type
    ]);
    expect(matrix.overrides).toEqual({ Colaborador: { projects: { canCreateProject: true } } });
    expect(matrix.hasCustom).toBe(true);
    expect(matrix.permissions.Colaborador.projects!.canCreateProject).toBe(true);
    expect(matrix.permissions.Administrador).toEqual(DEFAULTS.Administrador);
    expect(matrix.permissions.Colaborador.clients).toEqual(DEFAULTS.Colaborador.clients);
  });

  it("no rows is the default matrix", () => {
    expect(buildPermissionsMatrix([])).toEqual({ overrides: {}, permissions: DEFAULTS, hasCustom: false });
  });

  it("a full edited matrix stores only its differences", () => {
    const edited = structuredClone(DEFAULTS);
    edited["Dirección"].team!.canDeleteCollaborator = true;
    expect(rowsFromPermissionsState(edited)).toEqual([
      { role: "Dirección", moduleId: "team", key: "canDeleteCollaborator", value: true },
    ]);
    expect(describePermissionChanges(DEFAULTS, buildPermissionsMatrix(rowsFromPermissionsState(edited)).permissions)).toEqual([
      "Dirección · Equipo › Eliminar colaborador: No → Sí",
    ]);
  });

  it("flags a value a capability doesn't accept", () => {
    expect(findInvalidPermissionCell({ Otros: { dashboard: { dataScope: "todo" } } })).toBe("Otros.dashboard.dataScope");
    expect(findInvalidPermissionCell({ Otros: { dashboard: { dataScope: "global" }, nope: { x: 1 } } })).toBeNull();
  });
});

describe("client gating equals server gating over the merged matrix", () => {
  const matrix = buildPermissionsMatrix(rowsFromPermissionsState(everythingFlipped()));

  it.each(SYSTEM_ACCESS_ROLES)("%s", (role) => {
    const access = sessionAccessFor(role, matrix.overrides[role]);
    const server = resolvedState(serverUser(access));
    const client = resolvedState(selectAuthenticatedUser({ access })!);

    expect(client).toEqual(server);
    expect(server).toEqual(matrix.permissions[role]);

    for (const moduleDefinition of PERMISSIONS_MODULES_REGISTRY) {
      for (const action of moduleDefinition.actions) {
        const value = server[moduleDefinition.id]![action.id];
        const expected = isPermissionLocked(role, moduleDefinition.id, action.id)
          ? DEFAULTS[role][moduleDefinition.id]![action.id]
          : everythingFlipped()[role][moduleDefinition.id]![action.id];
        expect(value, `${moduleDefinition.id}.${action.id}`).toBe(expected);
      }
    }
  });

  it("Administrador cannot be restricted, even with overrides on the user", () => {
    const user = serverUser(
      sessionAccessFor("Administrador", { projects: { canDeleteProject: false }, team: { canViewTeam: false } }),
    );
    expect(permissions.resolveProjectsCapabilities(user).canDeleteProject).toBe(true);
    expect(permissions.resolveTeamCapabilities(user).canViewTeam).toBe(true);
  });

  it("a matrix change for the viewer's access changes the session identity (the client caches reset)", () => {
    const before = sessionIdentityKey(sessionAccessFor("Colaborador", undefined));
    const after = sessionIdentityKey(sessionAccessFor("Colaborador", matrix.overrides.Colaborador));
    expect(after).not.toBe(before);
  });
});
