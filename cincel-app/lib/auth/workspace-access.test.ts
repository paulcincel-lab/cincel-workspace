// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: dbMock }));

import { staffPositions } from "@/lib/db/schema";
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
const POSITION_GROUPS = { residente: "g-puesto-residente", disenador: "g-puesto-disenador" };
const POSITIONS = { residente: "position-residente", disenador: "position-disenador" };

const MAPPINGS: GroupMappings = {
  roles: [
    { groupId: ROLE_GROUPS.administradores, role: "Administrador", rank: 80 },
    { groupId: ROLE_GROUPS.direccion, role: "Dirección", rank: 70 },
    { groupId: ROLE_GROUPS.senior, role: "Arquitecto Senior", rank: 40 },
    { groupId: ROLE_GROUPS.colaboradores, role: "Colaborador", rank: 20 },
  ],
  positions: [
    { groupId: POSITION_GROUPS.residente, positionId: POSITIONS.residente },
    { groupId: POSITION_GROUPS.disenador, positionId: POSITIONS.disenador },
  ],
};

function directoryWith(memberOf: string[], user: Partial<FakeDirectoryState> = {}): FakeDirectoryState {
  const groupIds = [...Object.values(ROLE_GROUPS), ...Object.values(POSITION_GROUPS)];
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
  it("gives Arquitecto Senior and Residente de obra for the senior and residente groups", async () => {
    await expect(evaluate(directoryWith([ROLE_GROUPS.senior, POSITION_GROUPS.residente]))).resolves.toEqual({
      allowed: true,
      role: "Arquitecto Senior",
      positionIds: [POSITIONS.residente],
      positionsManaged: true,
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
      positions: [],
    };
    const result = await evaluate(directoryWith([ROLE_GROUPS.colaboradores, ROLE_GROUPS.senior]), tied);
    expect(result).toMatchObject({ allowed: true, role: "Arquitecto Senior" });
  });

  it("returns every matched puesto", async () => {
    const result = await evaluate(
      directoryWith([ROLE_GROUPS.senior, POSITION_GROUPS.residente, POSITION_GROUPS.disenador]),
    );
    expect(result.allowed && [...result.positionIds].sort()).toEqual([POSITIONS.disenador, POSITIONS.residente]);
  });

  it("gives a puesto once when two groups map to it", async () => {
    const twice: GroupMappings = {
      roles: MAPPINGS.roles,
      positions: [
        { groupId: POSITION_GROUPS.residente, positionId: POSITIONS.residente },
        { groupId: POSITION_GROUPS.disenador, positionId: POSITIONS.residente },
      ],
    };
    const result = await evaluate(
      directoryWith([ROLE_GROUPS.senior, POSITION_GROUPS.residente, POSITION_GROUPS.disenador]),
      twice,
    );
    expect(result).toMatchObject({ allowed: true, positionIds: [POSITIONS.residente], positionsManaged: true });
  });

  it("allows a role group without position groups, with no puestos", async () => {
    await expect(evaluate(directoryWith([ROLE_GROUPS.senior]))).resolves.toMatchObject({
      allowed: true,
      positionIds: [],
      positionsManaged: true,
    });
  });

  it("marks puestos as unmanaged when no position mapping exists", async () => {
    const result = await evaluate(directoryWith([ROLE_GROUPS.senior]), { roles: MAPPINGS.roles, positions: [] });
    expect(result).toMatchObject({ allowed: true, positionIds: [], positionsManaged: false });
  });

  it("denies with no_role_group when the user is only in position groups", async () => {
    await expect(evaluate(directoryWith([POSITION_GROUPS.residente]))).resolves.toEqual({
      allowed: false,
      role: null,
      positionIds: [],
      positionsManaged: false,
      reason: "no_role_group",
    });
  });

  it("denies with no_role_group when no role mapping is configured", async () => {
    const result = await evaluate(directoryWith([ROLE_GROUPS.senior]), { roles: [], positions: MAPPINGS.positions });
    expect(result).toMatchObject({ allowed: false, reason: "no_role_group" });
  });

  it("denies a personal Gmail account with domain without calling the Directory", async () => {
    const directory = { getUserStatus: vi.fn(), hasMember: vi.fn(), getGroup: vi.fn(), countMembers: vi.fn() };
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
      positions: [{ groupId: ROLE_GROUPS.senior, positionId: POSITIONS.disenador }],
    };
    await evaluateAccess(SUB, EMAIL, { directory, mappings: shared, workspaceDomain: DOMAIN });
    expect(directory.hasMember).toHaveBeenCalledTimes(1);
    expect(directory.hasMember).toHaveBeenCalledWith(ROLE_GROUPS.senior, EMAIL);
  });
});

describe("loadGroupMappings", () => {
  it("reads position mappings and ignores unknown roles and soft-deleted puestos", async () => {
    const rows = [
      { groupId: "g1", kind: "role", role: "Arquitecto Senior", rank: 40, positionId: null, positionDeletedAt: null },
      { groupId: "g2", kind: "role", role: "Cliente", rank: 90, positionId: null, positionDeletedAt: null },
      { groupId: "g3", kind: "position", role: null, rank: 0, positionId: "p1", positionDeletedAt: null },
      { groupId: "g4", kind: "position", role: null, rank: 0, positionId: "p2", positionDeletedAt: new Date() },
      { groupId: "g5", kind: "position", role: null, rank: 0, positionId: null, positionDeletedAt: null },
    ];
    dbMock.select.mockReturnValue({ from: () => ({ leftJoin: async () => rows }) });
    await expect(loadGroupMappings()).resolves.toEqual({
      roles: [{ groupId: "g1", role: "Arquitecto Senior", rank: 40 }],
      positions: [{ groupId: "g3", positionId: "p1" }],
    });
  });
});

function recordingTx() {
  const calls: Array<{ op: string; table?: unknown; values?: unknown; set?: unknown }> = [];
  const tx = {
    update: () => ({
      set: (set: unknown) => ({ where: async () => void calls.push({ op: "update", set }) }),
    }),
    delete: (table: unknown) => ({ where: async () => void calls.push({ op: "delete", table }) }),
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        onConflictDoNothing: async () => void calls.push({ op: "insert", table, values }),
      }),
    }),
  };
  return { tx, calls };
}

describe("applyAccess", () => {
  const granted = {
    allowed: true as const,
    role: "Arquitecto Senior" as const,
    positionIds: [POSITIONS.residente],
    positionsManaged: true,
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

  it("replaces the puestos with workspace rows when position mappings exist", async () => {
    const { tx, calls } = recordingTx();
    await applyAccess("staff-1", granted, tx as never);
    expect(calls.map((call) => call.op)).toEqual(["update", "delete", "insert"]);
    expect(calls[1].table).toBe(staffPositions);
    expect(calls[2].table).toBe(staffPositions);
    expect(calls[2].values).toEqual([{ positionId: POSITIONS.residente, staffId: "staff-1", source: "workspace" }]);
  });

  it("clears the puestos when position mappings exist but no position group matched", async () => {
    const { tx, calls } = recordingTx();
    await applyAccess("staff-1", { ...granted, positionIds: [] }, tx as never);
    expect(calls.map((call) => call.op)).toEqual(["update", "delete"]);
  });

  it("leaves the puestos alone when no position mapping exists", async () => {
    const { tx, calls } = recordingTx();
    await applyAccess("staff-1", { ...granted, positionIds: [], positionsManaged: false }, tx as never);
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
