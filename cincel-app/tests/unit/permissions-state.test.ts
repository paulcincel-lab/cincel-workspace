import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import { PERMISSIONS_MODULES_REGISTRY } from "@/lib/auth/permissionsRegistry";
import {
  buildDefaultPermissionsState,
  getEnabledModuleNames,
  parseStoredPermissionsState,
  permissionsStatesEqual,
  sanitizePermissionsState,
  splitModuleBadges,
  VISIBLE_MODULE_BADGES,
  type PermissionsState,
} from "@/lib/auth/permissionsState";
import { SYSTEM_ACCESS_ROLES } from "@/lib/data/roles";

const firstBooleanAction = () => {
  for (const moduleDefinition of PERMISSIONS_MODULES_REGISTRY) {
    const action = moduleDefinition.actions.find((candidate) => candidate.type === "boolean");
    if (action) return { moduleId: moduleDefinition.id, actionId: action.id };
  }
  throw new Error("registry has no boolean action");
};

function withToggled(state: PermissionsState): PermissionsState {
  const { moduleId, actionId } = firstBooleanAction();
  const role = "Colaborador";
  const current = state[role][moduleId][actionId];
  return {
    ...state,
    [role]: { ...state[role], [moduleId]: { ...state[role][moduleId], [actionId]: !current } },
  };
}

describe("buildDefaultPermissionsState", () => {
  it("covers every role, module and action with serializable values", () => {
    const state = buildDefaultPermissionsState();

    for (const role of SYSTEM_ACCESS_ROLES) {
      for (const moduleDefinition of PERMISSIONS_MODULES_REGISTRY) {
        for (const action of moduleDefinition.actions) {
          const value = state[role][moduleDefinition.id][action.id];
          expect(["boolean", "string"]).toContain(typeof value);
        }
      }
    }

    // Passed from the server page to the client component, so it must round-trip through JSON unchanged.
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("parseStoredPermissionsState", () => {
  const defaults = buildDefaultPermissionsState();

  it("returns the defaults untouched when nothing is stored", () => {
    const result = parseStoredPermissionsState(null, defaults);
    expect(result.hasCustom).toBe(false);
    expect(result.state).toBe(defaults);
  });

  it("falls back to the defaults on unreadable JSON", () => {
    const result = parseStoredPermissionsState("{not json", defaults);
    expect(result.hasCustom).toBe(false);
    expect(result.state).toBe(defaults);
  });

  it("applies a stored override and keeps defaults for the rest", () => {
    const custom = withToggled(defaults);
    const result = parseStoredPermissionsState(JSON.stringify({ version: 1, roles: custom }), defaults);
    expect(result.hasCustom).toBe(true);
    expect(permissionsStatesEqual(result.state, custom)).toBe(true);
    expect(permissionsStatesEqual(result.state, defaults)).toBe(false);
  });

  it("drops invalid values in favor of the defaults", () => {
    const { moduleId, actionId } = firstBooleanAction();
    const roles = { Colaborador: { [moduleId]: { [actionId]: "yes" } } };
    const result = sanitizePermissionsState(defaults, { version: 1, roles });
    expect(result.Colaborador[moduleId][actionId]).toBe(defaults.Colaborador[moduleId][actionId]);
  });
});

describe("permissionsStatesEqual", () => {
  it("matches the old JSON comparison", () => {
    const defaults = buildDefaultPermissionsState();
    const copy = JSON.parse(JSON.stringify(defaults)) as PermissionsState;
    const changed = withToggled(defaults);

    expect(permissionsStatesEqual(defaults, copy)).toBe(JSON.stringify(defaults) === JSON.stringify(copy));
    expect(permissionsStatesEqual(defaults, changed)).toBe(JSON.stringify(defaults) === JSON.stringify(changed));
    expect(permissionsStatesEqual(defaults, changed)).toBe(false);
  });
});

describe("module badges", () => {
  it("lists the enabled module names in registry order", () => {
    const defaults = buildDefaultPermissionsState();
    const names = getEnabledModuleNames(defaults.Administrador);
    const registryOrder = PERMISSIONS_MODULES_REGISTRY.map((moduleDefinition) => moduleDefinition.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual(registryOrder.filter((name) => names.includes(name)));
  });

  it("caps the inline badges and counts the rest", () => {
    const modules = Array.from({ length: VISIBLE_MODULE_BADGES + 3 }, (_, i) => `M${i}`);
    const { visible, hiddenCount } = splitModuleBadges(modules);
    expect(visible).toEqual(modules.slice(0, VISIBLE_MODULE_BADGES));
    expect(hiddenCount).toBe(3);
  });

  it("shows everything when under the cap", () => {
    expect(splitModuleBadges(["A", "B"])).toEqual({ visible: ["A", "B"], hiddenCount: 0 });
    expect(splitModuleBadges([])).toEqual({ visible: [], hiddenCount: 0 });
  });
});
