// @vitest-environment node
/**
 * Role and puesto changes for Google-managed staff are refused by the server
 * actions themselves (BE §A.7, §A.11 #12), not only hidden in the UI.
 */
import { unwrapActions } from "@/tests/helpers/action-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "admin", name: "Admin", role: "Administrador", area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
    email: "admin@cincel.example",
    access: "Administrador",
  })),
}));

const staffRepo = vi.hoisted(() => ({
  getStaffRoleLock: vi.fn(),
  googleManagedStaffIds: vi.fn(),
  updateStaff: vi.fn(),
  staffExists: vi.fn(async () => true),
  hasPositionGroupMappings: vi.fn(),
  listStaffPositionIds: vi.fn(),
}));
vi.mock("@/lib/repositories/staff-repository", () => staffRepo);

const positionsRepo = vi.hoisted(() => ({
  setStaffPositions: vi.fn(),
}));
vi.mock("@/lib/repositories/positions-repository", () => positionsRepo);

import { GOOGLE_MANAGED_ERROR, GOOGLE_MANAGED_REFUSAL } from "@/lib/types/workspace-access";

import * as staffActionsModule from "./staff-actions";
const { setStaffPositionsAction, updateStaffAction } = unwrapActions(staffActionsModule);

const GOOGLE = "00000000-0000-4000-8000-000000000001";
const PASSWORD = "00000000-0000-4000-8000-000000000002";
const POSITION_1 = "00000000-0000-4000-8000-0000000000a1";
const POSITION_2 = "00000000-0000-4000-8000-0000000000a2";

beforeEach(() => {
  vi.clearAllMocks();
  staffRepo.getStaffRoleLock.mockImplementation(async (id: string) => ({
    role: "Arquitecto Senior",
    googleManaged: id === GOOGLE,
  }));
  staffRepo.googleManagedStaffIds.mockImplementation(async (ids: string[]) => new Set(ids.filter((id) => id === GOOGLE)));
  staffRepo.staffExists.mockResolvedValue(true);
  staffRepo.hasPositionGroupMappings.mockResolvedValue(true);
  staffRepo.listStaffPositionIds.mockResolvedValue([POSITION_1]);
  staffRepo.updateStaff.mockResolvedValue({ id: "x" });
});

describe("updateStaffAction", () => {
  it("refuses a role change for Google-managed staff", async () => {
    await expect(updateStaffAction(GOOGLE, { role: "Dirección" })).resolves.toEqual({ ok: false, error: GOOGLE_MANAGED_ERROR });
    expect(staffRepo.updateStaff).not.toHaveBeenCalled();
  });

  it("lets other fields of Google-managed staff change, including a form that resends the same role", async () => {
    await updateStaffAction(GOOGLE, { phone: "555" });
    await updateStaffAction(GOOGLE, { name: "Ana", role: " Arquitecto Senior " });
    expect(staffRepo.updateStaff).toHaveBeenCalledTimes(2);
  });

  it("leaves non-Google staff unaffected", async () => {
    await updateStaffAction(PASSWORD, { role: "Dirección" });
    expect(staffRepo.updateStaff).toHaveBeenCalledWith(PASSWORD, { role: "Dirección" }, "admin");
  });
});

describe("ActionResult", () => {
  it("updateStaffAction returns the refusal as the failed result and a save as { ok: true, data }", async () => {
    await expect(staffActionsModule.updateStaffAction(GOOGLE, { role: "Dirección" })).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
    await expect(staffActionsModule.updateStaffAction(PASSWORD, { role: "Dirección" })).resolves.toEqual({
      ok: true,
      data: { id: "x" },
    });
  });
});

describe("setStaffPositionsAction", () => {
  it("refuses a puesto change for Google-managed staff when position mappings exist", async () => {
    await expect(setStaffPositionsAction(GOOGLE, [POSITION_1, POSITION_2])).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
    await expect(setStaffPositionsAction(GOOGLE, [])).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
    expect(staffRepo.listStaffPositionIds).toHaveBeenCalledWith(GOOGLE, "workspace");
    expect(positionsRepo.setStaffPositions).not.toHaveBeenCalled();
  });

  it("accepts the workspace puestos back, and any change for non-Google staff", async () => {
    await setStaffPositionsAction(GOOGLE, [POSITION_1]);
    await setStaffPositionsAction(PASSWORD, [POSITION_2]);
    expect(positionsRepo.setStaffPositions).toHaveBeenCalledTimes(2);
    expect(positionsRepo.setStaffPositions).toHaveBeenLastCalledWith(PASSWORD, [POSITION_2]);
  });

  it("lets Google-managed staff change puestos while no position mapping exists", async () => {
    staffRepo.hasPositionGroupMappings.mockResolvedValue(false);
    await setStaffPositionsAction(GOOGLE, [POSITION_1, POSITION_2]);
    expect(positionsRepo.setStaffPositions).toHaveBeenCalledWith(GOOGLE, [POSITION_1, POSITION_2]);
  });
});

