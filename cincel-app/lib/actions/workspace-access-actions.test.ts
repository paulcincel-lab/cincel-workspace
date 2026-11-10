import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";

import { setFakeDirectoryState } from "@/lib/google/fake-directory";
import type { GroupMapping } from "@/lib/types/workspace-access";

const POSITION_ID = "11111111-1111-4111-8111-111111111111";
const MAPPING_ID = "22222222-2222-4222-8222-222222222222";

const sessionAccess = vi.hoisted(() => ({
  value: {
    status: "active",
    user: { id: "admin", access: "Administrador" },
  } as {
    status: string;
    user: { id: string; access: string } | null;
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: vi.fn(async () => sessionAccess.value),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const repo = vi.hoisted(() => ({
  listGroupMappings: vi.fn(),
  getGroupMapping: vi.fn(),
  groupMappingExists: vi.fn(),
  insertGroupMapping: vi.fn(),
  updateGroupMapping: vi.fn(),
  deleteGroupMapping: vi.fn(),
}));
vi.mock("@/lib/repositories/workspace-group-mappings-repository", () => repo);

const positionExists = vi.hoisted(() => vi.fn());
vi.mock("@/lib/repositories/positions-repository", () => ({ positionExists }));

const recheckStaffAccess = vi.hoisted(() => vi.fn());
const recordDirectoryError = vi.hoisted(() => vi.fn());
const loadGoogleHealth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/access-recheck", () => ({ recheckStaffAccess }));
vi.mock("@/lib/auth/directory-error-log", () => ({ recordDirectoryError }));
vi.mock("@/lib/auth/google-health", () => ({ loadGoogleHealth }));

import {
  createGroupMappingAction,
  deleteGroupMappingAction,
  getGoogleHealthAction,
  listGroupMappingsAction,
  recheckStaffAccessAction,
  updateGroupMappingAction,
} from "./workspace-access-actions";

const STAFF_ID = "33333333-3333-4333-8333-333333333333";

const mapping: GroupMapping = {
  id: MAPPING_ID,
  groupEmail: "cincel-direccion@example.test",
  kind: "role",
  role: "Dirección",
  positionId: null,
  positionName: null,
  rank: 70,
  memberCount: null,
  exists: null,
};

const roleInput = {
  groupEmail: " Cincel-Direccion@Example.test ",
  kind: "role" as const,
  role: "Dirección",
  rank: 70,
};

function asRole(access: string, status = "active") {
  sessionAccess.value = { status, user: { id: "someone", access } };
}

describe("workspace-access-actions (group mappings)", () => {
  const previousFake = process.env.GOOGLE_FAKE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_FAKE = "1";
    setFakeDirectoryState({
      groups: [
        {
          id: "g-direccion",
          email: "cincel-direccion@example.test",
          name: "Dirección",
        },
        {
          id: "g-diseno",
          email: "cincel-puesto-diseno@example.test",
          name: "Diseño",
        },
      ],
    });
    asRole("Administrador");
    positionExists.mockResolvedValue(true);
    repo.groupMappingExists.mockResolvedValue(false);
    repo.getGroupMapping.mockResolvedValue(mapping);
    repo.insertGroupMapping.mockResolvedValue(mapping);
    repo.updateGroupMapping.mockResolvedValue(mapping);
    repo.listGroupMappings.mockResolvedValue([mapping]);
  });

  afterAll(() => {
    setFakeDirectoryState(null);
    if (previousFake === undefined) delete process.env.GOOGLE_FAKE;
    else process.env.GOOGLE_FAKE = previousFake;
  });

  describe("Administrador", () => {
    it("lists mappings", async () => {
      await expect(listGroupMappingsAction()).resolves.toEqual([mapping]);
    });

    it("creates a role mapping with the group id from groups.get", async () => {
      await expect(createGroupMappingAction(roleInput)).resolves.toEqual({
        ok: true,
        mapping,
      });
      expect(repo.groupMappingExists).toHaveBeenCalledWith("g-direccion", "role", undefined);
      expect(repo.insertGroupMapping).toHaveBeenCalledWith({
        groupEmail: "cincel-direccion@example.test",
        groupId: "g-direccion",
        kind: "role",
        role: "Dirección",
        positionId: null,
        rank: 70,
      });
    });

    it("creates a position mapping with rank 0", async () => {
      const result = await createGroupMappingAction({
        groupEmail: "cincel-puesto-diseno@example.test",
        kind: "position",
        positionId: POSITION_ID,
        rank: 99,
      });
      expect(result.ok).toBe(true);
      expect(repo.insertGroupMapping).toHaveBeenCalledWith({
        groupEmail: "cincel-puesto-diseno@example.test",
        groupId: "g-diseno",
        kind: "position",
        role: null,
        positionId: POSITION_ID,
        rank: 0,
      });
    });

    it("checks the puesto exists and revalidates nothing (Google and Puestos read through TanStack Query)", async () => {
      await createGroupMappingAction({
        groupEmail: "cincel-puesto-diseno@example.test",
        kind: "position",
        positionId: POSITION_ID,
      });
      expect(positionExists).toHaveBeenCalledWith(POSITION_ID);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("revalidates nothing on delete (the caller invalidates ajustes.page('google'))", async () => {
      await expect(deleteGroupMappingAction(MAPPING_ID)).resolves.toEqual({ ok: true });
      expect(repo.deleteGroupMapping).toHaveBeenCalledWith(MAPPING_ID);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("updates a mapping, excluding itself from the duplicate check", async () => {
      await expect(updateGroupMappingAction(MAPPING_ID, roleInput)).resolves.toEqual({ ok: true, mapping });
      expect(repo.groupMappingExists).toHaveBeenCalledWith("g-direccion", "role", MAPPING_ID);
      expect(repo.updateGroupMapping).toHaveBeenCalledWith(
        MAPPING_ID,
        expect.objectContaining({ groupId: "g-direccion" }),
      );
    });

    it("deletes a mapping", async () => {
      await expect(deleteGroupMappingAction(MAPPING_ID)).resolves.toEqual({
        ok: true,
      });
      expect(repo.deleteGroupMapping).toHaveBeenCalledWith(MAPPING_ID);
    });
  });

  describe("errors", () => {
    it("returns group_not_found for a group the Directory doesn't know", async () => {
      const result = await createGroupMappingAction({
        ...roleInput,
        groupEmail: "nope@example.test",
      });
      expect(result).toEqual({ ok: false, error: "group_not_found" });
      expect(repo.insertGroupMapping).not.toHaveBeenCalled();
    });

    it("returns group_not_found on update too", async () => {
      const result = await updateGroupMappingAction(MAPPING_ID, {
        ...roleInput,
        groupEmail: "nope@example.test",
      });
      expect(result).toEqual({ ok: false, error: "group_not_found" });
      expect(repo.updateGroupMapping).not.toHaveBeenCalled();
    });

    it("returns directory_error when the Directory fails and records it for Estado", async () => {
      setFakeDirectoryState({ failWith: "http" });
      await expect(createGroupMappingAction(roleInput)).resolves.toEqual({
        ok: false,
        error: "directory_error",
      });
      expect(recordDirectoryError).toHaveBeenCalledWith(
        "group_mapping",
        expect.objectContaining({ kind: "http", status: 503 }),
      );
    });

    it("returns duplicate when the group already has a mapping of that kind", async () => {
      repo.groupMappingExists.mockResolvedValue(true);
      await expect(createGroupMappingAction(roleInput)).resolves.toEqual({
        ok: false,
        error: "duplicate",
      });
    });

    it("returns duplicate on a unique violation from the database", async () => {
      repo.insertGroupMapping.mockRejectedValue(new Error("insert failed", { cause: { code: "23505" } }));
      await expect(createGroupMappingAction(roleInput)).resolves.toEqual({
        ok: false,
        error: "duplicate",
      });
    });

    it.each([
      ["bad email", { ...roleInput, groupEmail: "not-an-email" }],
      ["unknown role", { ...roleInput, role: "Cliente" }],
      ["role with a puesto", { ...roleInput, positionId: POSITION_ID }],
      ["fractional rank", { ...roleInput, rank: 1.5 }],
      [
        "position without positionId",
        {
          groupEmail: "cincel-puesto-diseno@example.test",
          kind: "position" as const,
        },
      ],
      [
        "position with a role",
        {
          groupEmail: "cincel-puesto-diseno@example.test",
          kind: "position" as const,
          positionId: POSITION_ID,
          role: "Dirección",
        },
      ],
      ["unknown kind", { ...roleInput, kind: "otro" as unknown as "role" }],
    ])("returns invalid for %s", async (_label, input) => {
      await expect(createGroupMappingAction(input)).resolves.toEqual({
        ok: false,
        error: "invalid",
      });
      expect(repo.insertGroupMapping).not.toHaveBeenCalled();
    });

    it("returns invalid for a puesto that doesn't exist", async () => {
      positionExists.mockResolvedValue(false);
      const result = await createGroupMappingAction({
        groupEmail: "cincel-puesto-diseno@example.test",
        kind: "position",
        positionId: POSITION_ID,
      });
      expect(result).toEqual({ ok: false, error: "invalid" });
    });

    it("returns invalid when updating a mapping that doesn't exist", async () => {
      repo.getGroupMapping.mockResolvedValue(null);
      await expect(updateGroupMappingAction(MAPPING_ID, roleInput)).resolves.toEqual({ ok: false, error: "invalid" });
      await expect(updateGroupMappingAction("not-a-uuid", roleInput)).resolves.toEqual({ ok: false, error: "invalid" });
    });
  });

  describe.each([
    ["Dirección", "active"],
    ["Colaborador", "active"],
    ["Administrador", "pending_first_access"],
  ])("%s (%s)", (access, status) => {
    beforeEach(() => asRole(access, status));

    it("is forbidden from every action", async () => {
      await expect(listGroupMappingsAction()).rejects.toThrow("FORBIDDEN");
      await expect(createGroupMappingAction(roleInput)).resolves.toEqual({
        ok: false,
        error: "forbidden",
      });
      await expect(updateGroupMappingAction(MAPPING_ID, roleInput)).resolves.toEqual({ ok: false, error: "forbidden" });
      await expect(deleteGroupMappingAction(MAPPING_ID)).resolves.toEqual({
        ok: false,
        error: "forbidden",
      });
      expect(repo.listGroupMappings).not.toHaveBeenCalled();
      expect(repo.insertGroupMapping).not.toHaveBeenCalled();
      expect(repo.updateGroupMapping).not.toHaveBeenCalled();
      expect(repo.deleteGroupMapping).not.toHaveBeenCalled();
    });

    it("is refused the re-check and the health payload", async () => {
      await expect(recheckStaffAccessAction(STAFF_ID)).resolves.toEqual({ ok: false, error: "forbidden" });
      await expect(getGoogleHealthAction()).rejects.toThrow("FORBIDDEN");
      expect(recheckStaffAccess).not.toHaveBeenCalled();
      expect(loadGoogleHealth).not.toHaveBeenCalled();
    });
  });

  it("is forbidden without a session", async () => {
    sessionAccess.value = { status: "guest", user: null };
    await expect(createGroupMappingAction(roleInput)).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    await expect(deleteGroupMappingAction(MAPPING_ID)).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  describe("recheckStaffAccessAction", () => {
    it("re-checks ignoring the interval and reports a kept access", async () => {
      recheckStaffAccess.mockResolvedValue({ status: "kept" });
      await expect(recheckStaffAccessAction(STAFF_ID)).resolves.toEqual({ ok: true, allowed: true });
      expect(recheckStaffAccess).toHaveBeenCalledWith(STAFF_ID, { force: true });
    });

    it("reports a revoke with its reason", async () => {
      recheckStaffAccess.mockResolvedValue({ status: "revoked", reason: "workspace_suspended" });
      await expect(recheckStaffAccessAction(STAFF_ID)).resolves.toEqual({
        ok: true,
        allowed: false,
        reason: "workspace_suspended",
      });
    });

    it("maps a Directory error and staff without google_sub", async () => {
      recheckStaffAccess.mockResolvedValueOnce({ status: "error", error: new Error("down") });
      await expect(recheckStaffAccessAction(STAFF_ID)).resolves.toEqual({ ok: false, error: "directory_error" });
      recheckStaffAccess.mockResolvedValueOnce({ status: "not_google_linked" });
      await expect(recheckStaffAccessAction(STAFF_ID)).resolves.toEqual({ ok: false, error: "not_google_linked" });
      await expect(recheckStaffAccessAction("nope")).resolves.toEqual({ ok: false, error: "not_google_linked" });
    });
  });

  it("returns the health payload to an Administrador", async () => {
    loadGoogleHealth.mockResolvedValue({ activeStaff: 3 });
    await expect(getGoogleHealthAction()).resolves.toEqual({ activeStaff: 3 });
  });
});
