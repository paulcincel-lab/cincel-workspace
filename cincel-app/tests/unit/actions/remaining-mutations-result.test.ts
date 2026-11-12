import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ canEditClient: false, canDeleteCollab: false, canManagePositions: false }));
const repo = vi.hoisted(() => ({
  setContactTags: vi.fn(async () => undefined),
  setContactPeople: vi.fn(async () => undefined),
  softDeleteStaff: vi.fn(async () => undefined),
  reorderStaff: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: "staff-1" }, access: "Colaborador" })),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveClientsCapabilities: () => ({ canEditClient: session.canEditClient }),
  resolveTeamCapabilities: () => ({ canDeleteCollaborator: session.canDeleteCollab }),
  resolvePositionsCapabilities: () => ({ canManagePositions: session.canManagePositions }),
}));
vi.mock("@/lib/repositories/contacts-repository", () => repo);
vi.mock("@/lib/repositories/staff-repository", () => repo);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { setContactTagsAction } from "@/lib/actions/contacts-actions";
import { deleteStaffAction, reorderStaffAction } from "@/lib/actions/staff-actions";

beforeEach(() => {
  vi.clearAllMocks();
  session.canEditClient = false;
  session.canDeleteCollab = false;
  session.canManagePositions = false;
});

describe("remaining user-facing mutations return ActionResult", () => {
  it("setContactTagsAction returns the forbidden code instead of throwing", async () => {
    await expect(setContactTagsAction("c1", [])).resolves.toEqual({ ok: false, error: "FORBIDDEN: contact edit" });
    expect(repo.setContactTags).not.toHaveBeenCalled();
  });

  it("setContactTagsAction returns { ok: true } when allowed", async () => {
    session.canEditClient = true;
    await expect(setContactTagsAction("c1", [])).resolves.toEqual({ ok: true, data: undefined });
  });

  it("deleteStaffAction returns the forbidden code instead of throwing", async () => {
    await expect(deleteStaffAction("s1")).resolves.toEqual({ ok: false, error: "FORBIDDEN: staff delete" });
    expect(repo.softDeleteStaff).not.toHaveBeenCalled();
  });

  it("reorderStaffAction returns the forbidden code instead of throwing", async () => {
    await expect(reorderStaffAction(["s1"])).resolves.toEqual({ ok: false, error: "FORBIDDEN: staff reorder" });
    expect(repo.reorderStaff).not.toHaveBeenCalled();
  });
});
