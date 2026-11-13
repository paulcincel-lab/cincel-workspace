// @vitest-environment node
/**
 * Catalog page-data actions (#954): each re-checks the page capability, a
 * guest gets FORBIDDEN, and the staff catalogs carry exactly `{id,name}`
 * (+ `suggested`), never the full `Staff`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKFLOW = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const STAFF_A = "33333333-3333-4333-8333-333333333333";
const STAFF_B = "44444444-4444-4444-8444-444444444444";

const session = vi.hoisted(() => ({ guest: false }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => {
    if (session.guest) throw new Error("FORBIDDEN");
    return { member: { id: "viewer" }, email: "", access: "Colaborador" };
  }),
}));

const caps = vi.hoisted(() => ({
  canViewProjects: true,
  canViewTeam: true,
  canViewClients: true,
  canViewTaskStatuses: true,
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: caps.canViewProjects }),
  resolveTeamCapabilities: () => ({ canViewTeam: caps.canViewTeam }),
  resolveClientsCapabilities: () => ({ canViewClients: caps.canViewClients }),
  resolveTaskStatusesCapabilities: () => ({ canViewTaskStatuses: caps.canViewTaskStatuses }),
}));

/** `db.select(...).from(...).where(...).orderBy(...)` resolving the next queued rows. */
const dbRows = vi.hoisted(() => ({ queue: [] as unknown[][] }));
vi.mock("@/lib/db/client", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: async () => dbRows.queue.shift() ?? [],
  };
  return { db: { select: vi.fn(() => chain) } };
});

const repos = vi.hoisted(() => ({
  listAssignableStaff: vi.fn(),
  countOpenTasksInTramo: vi.fn(async () => new Map()),
  listTramosNav: vi.fn(),
  listTaskStatuses: vi.fn(),
  projectExists: vi.fn(),
  listSpaces: vi.fn(),
}));
vi.mock("@/lib/repositories/staff-repository", () => ({
  listAssignableStaff: repos.listAssignableStaff,
  countOpenTasksInTramo: repos.countOpenTasksInTramo,
}));
vi.mock("@/lib/settings/general-settings-server", async () => {
  const { GENERAL_SETTINGS_DEFAULTS } = await import("@/lib/settings/general-settings");
  return { getGeneralSettings: async () => ({ settings: GENERAL_SETTINGS_DEFAULTS }) };
});
vi.mock("@/lib/repositories/workflows-repository", () => ({ listTramosNav: repos.listTramosNav }));
vi.mock("@/lib/repositories/task-statuses-repository", () => ({ listTaskStatuses: repos.listTaskStatuses }));
vi.mock("@/lib/repositories/projects-repository", () => ({ projectExists: repos.projectExists }));
vi.mock("@/lib/repositories/project-spaces-repository", () => ({ listSpaces: repos.listSpaces }));

import {
  fetchCatalogAssignableStaff,
  fetchCatalogContacts,
  fetchCatalogProjectOptions,
  fetchCatalogProjectSpaces,
  fetchCatalogStaff,
  fetchCatalogTaskStatuses,
  fetchCatalogWorkflows,
} from "./catalog-actions";

/** A full `Staff`-like row, with the PII a catalog must not return. */
function fullStaff(id: string, name: string, lastName: string | null, suggested: boolean) {
  return {
    id,
    kind: "empleado",
    name,
    lastName,
    phone: "555-0100",
    email: `${name.toLowerCase()}@example.com`,
    role: "Arquitecto",
    capacity: 40,
    availability: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    googleManaged: false,
    lastLoginAt: null,
    accessRevokedAt: null,
    accessRevokedReason: null,
    positions: [],
    candidatePhases: [],
    suggested,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.guest = false;
  Object.assign(caps, { canViewProjects: true, canViewTeam: true, canViewClients: true, canViewTaskStatuses: true });
  dbRows.queue = [];
});

describe("guest", () => {
  it("every catalog action throws FORBIDDEN", async () => {
    session.guest = true;
    await expect(fetchCatalogProjectOptions({})).rejects.toThrow("FORBIDDEN");
    await expect(fetchCatalogWorkflows({})).rejects.toThrow("FORBIDDEN");
    await expect(fetchCatalogTaskStatuses({})).rejects.toThrow("FORBIDDEN");
    await expect(fetchCatalogStaff({})).rejects.toThrow("FORBIDDEN");
    await expect(fetchCatalogAssignableStaff({ workflowId: null })).rejects.toThrow("FORBIDDEN");
    await expect(fetchCatalogProjectSpaces({ projectId: PROJECT })).rejects.toThrow("FORBIDDEN");
    await expect(fetchCatalogContacts({})).rejects.toThrow("FORBIDDEN");
  });
});

describe("fetchCatalogStaff", () => {
  it("returns exactly {id,name}, with the display name", async () => {
    dbRows.queue.push([
      { id: STAFF_A, name: "Ana", lastName: "Ruiz" },
      { id: STAFF_B, name: "Luis", lastName: null },
    ]);
    const rows = await fetchCatalogStaff({});
    expect(rows).toEqual([
      { id: STAFF_A, name: "Ana Ruiz" },
      { id: STAFF_B, name: "Luis" },
    ]);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["id", "name"]);
  });

  it("is empty without canViewTeam", async () => {
    caps.canViewTeam = false;
    expect(await fetchCatalogStaff({})).toEqual([]);
  });
});

describe("fetchCatalogAssignableStaff", () => {
  it("returns exactly {id,name,suggested} plus the etapa load, never the full Staff", async () => {
    repos.listAssignableStaff.mockResolvedValue([
      fullStaff(STAFF_A, "Ana", "Ruiz", true),
      fullStaff(STAFF_B, "Luis", null, false),
    ]);
    repos.countOpenTasksInTramo.mockResolvedValueOnce(new Map([[STAFF_A, { open: 4, overdue: 2 }]]));
    const rows = await fetchCatalogAssignableStaff({ workflowId: WORKFLOW });
    expect(repos.listAssignableStaff).toHaveBeenCalledWith({ workflowId: WORKFLOW });
    expect(repos.countOpenTasksInTramo).toHaveBeenCalledWith(WORKFLOW, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(rows).toEqual([
      { id: STAFF_A, name: "Ana Ruiz", suggested: true, openCount: 4, overdueCount: 2 },
      { id: STAFF_B, name: "Luis", suggested: false, openCount: 0, overdueCount: 0 },
    ]);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["id", "name", "openCount", "overdueCount", "suggested"]);
  });

  it("without a etapa the rows are exactly {id,name,suggested}", async () => {
    repos.listAssignableStaff.mockResolvedValue([fullStaff(STAFF_A, "Ana", "Ruiz", true)]);
    const rows = await fetchCatalogAssignableStaff({ workflowId: null });
    expect(rows).toEqual([{ id: STAFF_A, name: "Ana Ruiz", suggested: true }]);
    expect(repos.countOpenTasksInTramo).not.toHaveBeenCalled();
  });

  it("accepts a null etapa and refuses a malformed id", async () => {
    repos.listAssignableStaff.mockResolvedValue([]);
    await fetchCatalogAssignableStaff({ workflowId: null });
    expect(repos.listAssignableStaff).toHaveBeenCalledWith({ workflowId: null });
    await expect(fetchCatalogAssignableStaff({ workflowId: "nope" })).rejects.toThrow(/INVALID/);
  });
});

describe("fetchCatalogProjectOptions", () => {
  it("returns exactly {id,name,status}", async () => {
    dbRows.queue.push([{ id: PROJECT, name: "Casa Valle", status: "activo" }]);
    const rows = await fetchCatalogProjectOptions({});
    expect(rows).toEqual([{ id: PROJECT, name: "Casa Valle", status: "activo" }]);
    expect(Object.keys(rows[0]).sort()).toEqual(["id", "name", "status"]);
  });

  it("is empty without canViewProjects", async () => {
    caps.canViewProjects = false;
    expect(await fetchCatalogProjectOptions({})).toEqual([]);
  });
});

describe("fetchCatalogContacts", () => {
  it("returns exactly {id,name,type}", async () => {
    dbRows.queue.push([{ id: STAFF_A, name: "Grupo Norte", type: "cliente" }]);
    const rows = await fetchCatalogContacts({ type: "cliente" });
    expect(Object.keys(rows[0]).sort()).toEqual(["id", "name", "type"]);
  });

  it("is empty without canViewClients and refuses an unknown type", async () => {
    caps.canViewClients = false;
    expect(await fetchCatalogContacts({})).toEqual([]);
    await expect(fetchCatalogContacts({ type: "otro" as never })).rejects.toThrow(/INVALID/);
  });
});

describe("fetchCatalogProjectSpaces", () => {
  it("lists the espacios of a visible project", async () => {
    repos.projectExists.mockResolvedValue(true);
    repos.listSpaces.mockResolvedValue([{ id: STAFF_A, name: "Cocina", projectId: PROJECT, sortOrder: 0, taskCount: 2 }]);
    const rows = await fetchCatalogProjectSpaces({ projectId: PROJECT });
    expect(repos.listSpaces).toHaveBeenCalledWith(PROJECT);
    expect(rows).toHaveLength(1);
  });

  it("is null without canViewProjects, and reads nothing", async () => {
    caps.canViewProjects = false;
    expect(await fetchCatalogProjectSpaces({ projectId: PROJECT })).toBeNull();
    expect(repos.projectExists).not.toHaveBeenCalled();
    expect(repos.listSpaces).not.toHaveBeenCalled();
  });

  it("is null for a missing or deleted project", async () => {
    repos.projectExists.mockResolvedValue(false);
    expect(await fetchCatalogProjectSpaces({ projectId: PROJECT })).toBeNull();
    expect(repos.listSpaces).not.toHaveBeenCalled();
  });
});

describe("fetchCatalogWorkflows / fetchCatalogTaskStatuses", () => {
  it("workflows are the active etapa refs", async () => {
    const refs = [{ id: WORKFLOW, key: "presale", name: "Presale", sortOrder: 0 }];
    repos.listTramosNav.mockResolvedValue(refs);
    expect(await fetchCatalogWorkflows({})).toEqual(refs);
  });

  it("task statuses need canViewTaskStatuses", async () => {
    repos.listTaskStatuses.mockResolvedValue([{ id: "s", name: "Hecho", closes: true, countsAsCompleted: true, sortOrder: 0 }]);
    expect(await fetchCatalogTaskStatuses({})).toHaveLength(1);
    caps.canViewTaskStatuses = false;
    expect(await fetchCatalogTaskStatuses({})).toEqual([]);
  });
});
