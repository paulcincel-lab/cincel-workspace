// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: dbMock }));

import { getFakeDirectory, setFakeDirectoryState, type FakeDirectoryState } from "@/lib/google/fake-directory";
import { DirectoryError } from "@/lib/google/directory";

import { applyAccess, evaluateAccess, loadGroupMappings, type GroupMappings } from "./workspace-access";

const DOMAIN = "cincel.example";
const SUB = "100000000000000000001";
const EMAIL = "ana@cincel.example";

const ROLE_GROUPS = {
  administradores: "g-admin",
  direccion: "g-direccion",
  senior: "g-senior",
  colaboradores: "g-colaboradores",
};
const AREA_GROUPS = { construccion: "g-area-construccion", diseno: "g-area-diseno" };
const AREAS = { construccion: "area-construccion", diseno: "area-diseno" };

const MAPPINGS: GroupMappings = {
  roles: [
    { groupId: ROLE_GROUPS.administradores, role: "Administrador", rank: 80 },
    { groupId: ROLE_GROUPS.direccion, role: "Dirección", rank: 70 },
    { groupId: ROLE_GROUPS.senior, role: "Arquitecto Senior", rank: 40 },
    { groupId: ROLE_GROUPS.colaboradores, role: "Colaborador", rank: 20 },
  ],
  areas: [
    { groupId: AREA_GROUPS.construccion, areaId: AREAS.construccion },
    { groupId: AREA_GROUPS.diseno, areaId: AREAS.diseno },
  ],
};

function directoryWith(memberOf: string[], user: Partial<FakeDirectoryState> = {}): FakeDirectoryState {
  const groupIds = [...Object.values(ROLE_GROUPS), ...Object.values(AREA_GROUPS)];
  return {
    users: [{ id: SUB, primaryEmail: EMAIL }],
    groups: groupIds.map((id) => ({ id, email: `${id}@${DOMAIN}`, members: memberOf.includes(id) ? [EMAIL] : [] })),
    ...user,
  };
}

function evaluate(state: FakeDirectoryState, mappings: GroupMappings = MAPPINGS, email = EMAIL) {
  setFakeDirectoryState(state);
  return evaluateAccess(SUB, email, { directory: getFakeDirectory(), mappings, workspaceDomain: DOMAIN });
}

afterEach(() => {
  setFakeDirectoryState(null);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("evaluateAccess", () => {
  it("gives Arquitecto Senior and Construcción for the senior and construcción groups", async () => {
    await expect(evaluate(directoryWith([ROLE_GROUPS.senior, AREA_GROUPS.construccion]))).resolves.toEqual({
      allowed: true,
      role: "Arquitecto Senior",
      areaIds: [AREAS.construccion],
      areasManaged: true,
      reason: null,
    });
  });

  it("picks the highest-rank role group", async () => {
    const result = await evaluate(directoryWith([ROLE_GROUPS.colaboradores, ROLE_GROUPS.direccion]));
    expect(result).toMatchObject({ allowed: true, role: "Dirección" });
  });

  it("breaks rank ties by the official role order", async () => {
    const tied: GroupMappings = {
      roles: [
        { groupId: ROLE_GROUPS.colaboradores, role: "Colaborador", rank: 10 },
        { groupId: ROLE_GROUPS.senior, role: "Arquitecto Senior", rank: 10 },
      ],
      areas: [],
    };
    const result = await evaluate(directoryWith([ROLE_GROUPS.colaboradores, ROLE_GROUPS.senior]), tied);
    expect(result).toMatchObject({ allowed: true, role: "Arquitecto Senior" });
  });

  it("returns every matched área", async () => {
    const result = await evaluate(directoryWith([ROLE_GROUPS.senior, AREA_GROUPS.construccion, AREA_GROUPS.diseno]));
    expect(result.allowed && [...result.areaIds].sort()).toEqual([AREAS.construccion, AREAS.diseno]);
  });

  it("allows a role group without area groups, with no áreas", async () => {
    await expect(evaluate(directoryWith([ROLE_GROUPS.senior]))).resolves.toMatchObject({
      allowed: true,
      areaIds: [],
      areasManaged: true,
    });
  });

  it("marks áreas as unmanaged when no area mapping exists", async () => {
    const result = await evaluate(directoryWith([ROLE_GROUPS.senior]), { roles: MAPPINGS.roles, areas: [] });
    expect(result).toMatchObject({ allowed: true, areaIds: [], areasManaged: false });
  });

  it("denies with no_role_group when the user is in no role group", async () => {
    await expect(evaluate(directoryWith([AREA_GROUPS.construccion]))).resolves.toEqual({
      allowed: false,
      role: null,
      areaIds: [],
      areasManaged: false,
      reason: "no_role_group",
    });
  });

  it("denies with no_role_group when no role mapping is configured", async () => {
    const result = await evaluate(directoryWith([ROLE_GROUPS.senior]), { roles: [], areas: MAPPINGS.areas });
    expect(result).toMatchObject({ allowed: false, reason: "no_role_group" });
  });

  it("denies a personal Gmail account with domain without calling the Directory", async () => {
    const directory = { getUserStatus: vi.fn(), hasMember: vi.fn(), getGroup: vi.fn() };
    const result = await evaluateAccess(SUB, "ana@gmail.com", {
      directory,
      mappings: MAPPINGS,
      workspaceDomain: DOMAIN,
    });
    expect(result).toMatchObject({ allowed: false, reason: "domain" });
    expect(directory.getUserStatus).not.toHaveBeenCalled();
    expect(directory.hasMember).not.toHaveBeenCalled();
  });

  it("denies with domain when GOOGLE_WORKSPACE_DOMAIN is not set", async () => {
    vi.stubEnv("GOOGLE_WORKSPACE_DOMAIN", "");
    setFakeDirectoryState(directoryWith([ROLE_GROUPS.senior]));
    const result = await evaluateAccess(SUB, EMAIL, { directory: getFakeDirectory(), mappings: MAPPINGS });
    expect(result).toMatchObject({ allowed: false, reason: "domain" });
  });

  it("reads the domain from GOOGLE_WORKSPACE_DOMAIN, case insensitive", async () => {
    vi.stubEnv("GOOGLE_WORKSPACE_DOMAIN", " Cincel.Example ");
    setFakeDirectoryState(directoryWith([ROLE_GROUPS.senior]));
    const result = await evaluateAccess(SUB, "Ana@CINCEL.example", {
      directory: getFakeDirectory(),
      mappings: MAPPINGS,
    });
    expect(result).toMatchObject({ allowed: true, role: "Arquitecto Senior" });
  });

  it("denies a suspended user with workspace_suspended", async () => {
    const state = directoryWith([ROLE_GROUPS.senior], {
      users: [{ id: SUB, primaryEmail: EMAIL, status: "suspended" }],
    });
    await expect(evaluate(state)).resolves.toMatchObject({ allowed: false, reason: "workspace_suspended" });
  });

  it("denies an archived user with workspace_suspended", async () => {
    const state = directoryWith([ROLE_GROUPS.senior], {
      users: [{ id: SUB, primaryEmail: EMAIL, status: "archived" }],
    });
    await expect(evaluate(state)).resolves.toMatchObject({ allowed: false, reason: "workspace_suspended" });
  });

  it("denies a user missing from the Directory with workspace_deleted", async () => {
    await expect(evaluate(directoryWith([ROLE_GROUPS.senior], { users: [] }))).resolves.toMatchObject({
      allowed: false,
      reason: "workspace_deleted",
    });
  });

  it("throws DirectoryError when the Directory fails", async () => {
    await expect(evaluate(directoryWith([ROLE_GROUPS.senior], { failWith: "timeout" }))).rejects.toBeInstanceOf(
      DirectoryError,
    );
  });

  it("throws DirectoryError when the Directory is not configured", async () => {
    await expect(
      evaluateAccess(SUB, EMAIL, { directory: null, mappings: MAPPINGS, workspaceDomain: DOMAIN }),
    ).rejects.toBeInstanceOf(DirectoryError);
  });

  it("asks the Directory once per mapped group", async () => {
    setFakeDirectoryState(directoryWith([ROLE_GROUPS.senior]));
    const fake = getFakeDirectory();
    const directory = { ...fake, hasMember: vi.fn(fake.hasMember) };
    const shared: GroupMappings = {
      roles: [{ groupId: ROLE_GROUPS.senior, role: "Arquitecto Senior", rank: 40 }],
      areas: [{ groupId: ROLE_GROUPS.senior, areaId: AREAS.diseno }],
    };
    await evaluateAccess(SUB, EMAIL, { directory, mappings: shared, workspaceDomain: DOMAIN });
    expect(directory.hasMember).toHaveBeenCalledTimes(1);
    expect(directory.hasMember).toHaveBeenCalledWith(ROLE_GROUPS.senior, EMAIL);
  });
});

describe("loadGroupMappings", () => {
  it("ignores unknown roles and areas that are soft-deleted", async () => {
    const rows = [
      { groupId: "g1", kind: "role", role: "Arquitecto Senior", rank: 40, areaId: null, areaDeletedAt: null },
      { groupId: "g2", kind: "role", role: "Cliente", rank: 90, areaId: null, areaDeletedAt: null },
      { groupId: "g3", kind: "area", role: null, rank: 0, areaId: "a1", areaDeletedAt: null },
      { groupId: "g4", kind: "area", role: null, rank: 0, areaId: "a2", areaDeletedAt: new Date() },
    ];
    dbMock.select.mockReturnValue({ from: () => ({ leftJoin: async () => rows }) });
    await expect(loadGroupMappings()).resolves.toEqual({
      roles: [{ groupId: "g1", role: "Arquitecto Senior", rank: 40 }],
      areas: [{ groupId: "g3", areaId: "a1" }],
    });
  });
});

function recordingTx() {
  const calls: Array<{ op: string; values?: unknown; set?: unknown }> = [];
  const tx = {
    update: () => ({
      set: (set: unknown) => ({ where: async () => void calls.push({ op: "update", set }) }),
    }),
    delete: () => ({ where: async () => void calls.push({ op: "delete" }) }),
    insert: () => ({
      values: (values: unknown) => ({ onConflictDoNothing: async () => void calls.push({ op: "insert", values }) }),
    }),
  };
  return { tx, calls };
}

describe("applyAccess", () => {
  const granted = {
    allowed: true as const,
    role: "Arquitecto Senior" as const,
    areaIds: [AREAS.construccion],
    areasManaged: true,
    reason: null,
  };

  it("sets the role, marks the check and clears the revocation", async () => {
    const { tx, calls } = recordingTx();
    await applyAccess("staff-1", granted, tx as never);
    expect(calls[0]).toMatchObject({
      op: "update",
      set: { role: "Arquitecto Senior", accessRevokedAt: null, accessRevokedReason: null },
    });
    expect((calls[0].set as { accessCheckedAt: Date }).accessCheckedAt).toBeInstanceOf(Date);
  });

  it("replaces the áreas with workspace rows when area mappings exist", async () => {
    const { tx, calls } = recordingTx();
    await applyAccess("staff-1", granted, tx as never);
    expect(calls.map((call) => call.op)).toEqual(["update", "delete", "insert"]);
    expect(calls[2].values).toEqual([{ areaId: AREAS.construccion, staffId: "staff-1", source: "workspace" }]);
  });

  it("clears the áreas when area mappings exist but no area group matched", async () => {
    const { tx, calls } = recordingTx();
    await applyAccess("staff-1", { ...granted, areaIds: [] }, tx as never);
    expect(calls.map((call) => call.op)).toEqual(["update", "delete"]);
  });

  it("leaves the áreas alone when no area mapping exists", async () => {
    const { tx, calls } = recordingTx();
    await applyAccess("staff-1", { ...granted, areaIds: [], areasManaged: false }, tx as never);
    expect(calls.map((call) => call.op)).toEqual(["update"]);
  });

  it("opens its own transaction when none is given", async () => {
    const { tx, calls } = recordingTx();
    dbMock.transaction.mockImplementation(async (run: (t: unknown) => Promise<void>) => run(tx));
    await applyAccess("staff-1", granted);
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(3);
  });
});
