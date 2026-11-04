// @vitest-environment node
/**
 * Role and área changes for Google-managed staff are refused by the server
 * actions themselves (BE §A.7, §A.11 #12), not only hidden in the UI.
 */
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
  listStaffAreaIds: vi.fn(),
  updateStaff: vi.fn(),
  setStaffAreas: vi.fn(),
}));
vi.mock("@/lib/repositories/staff-repository", () => staffRepo);

const areasRepo = vi.hoisted(() => ({ listAreaMemberIds: vi.fn(), setAreaMembers: vi.fn() }));
vi.mock("@/lib/repositories/areas-repository", () => areasRepo);

import { GOOGLE_MANAGED_ERROR, GOOGLE_MANAGED_REFUSAL } from "@/lib/types/workspace-access";

import { setAreaMembersAction } from "./areas-actions";
import { setStaffAreasAction, updateStaffAction } from "./staff-actions";

const GOOGLE = "google-staff";
const PASSWORD = "password-staff";

beforeEach(() => {
  vi.clearAllMocks();
  staffRepo.getStaffRoleLock.mockImplementation(async (id: string) => ({
    role: "Arquitecto Senior",
    googleManaged: id === GOOGLE,
  }));
  staffRepo.googleManagedStaffIds.mockImplementation(async (ids: string[]) => new Set(ids.filter((id) => id === GOOGLE)));
  staffRepo.listStaffAreaIds.mockResolvedValue(["area-1"]);
  staffRepo.updateStaff.mockResolvedValue({ id: "x" });
  areasRepo.listAreaMemberIds.mockResolvedValue([GOOGLE, PASSWORD]);
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

describe("setStaffAreasAction", () => {
  it("refuses an área change for Google-managed staff", async () => {
    await expect(setStaffAreasAction(GOOGLE, ["area-1", "area-2"])).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
    await expect(setStaffAreasAction(GOOGLE, [])).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
    expect(staffRepo.setStaffAreas).not.toHaveBeenCalled();
  });

  it("accepts the same áreas back, and any change for non-Google staff", async () => {
    await setStaffAreasAction(GOOGLE, ["area-1"]);
    await setStaffAreasAction(PASSWORD, ["area-2"]);
    expect(staffRepo.setStaffAreas).toHaveBeenCalledTimes(2);
  });
});

describe("setAreaMembersAction", () => {
  it("refuses removing a Google-managed member", async () => {
    await expect(setAreaMembersAction("area-1", [{ staffId: PASSWORD }])).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
    expect(areasRepo.setAreaMembers).not.toHaveBeenCalled();
  });

  it("refuses adding a Google-managed member", async () => {
    areasRepo.listAreaMemberIds.mockResolvedValue([PASSWORD]);
    await expect(
      setAreaMembersAction("area-1", [{ staffId: PASSWORD }, { staffId: GOOGLE }]),
    ).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
  });

  it("allows changes that only touch non-Google staff", async () => {
    await setAreaMembersAction("area-1", [{ staffId: GOOGLE }, { staffId: "other" }]);
    await setAreaMembersAction("area-1", [{ staffId: GOOGLE, role: "Líder" }]);
    expect(areasRepo.setAreaMembers).toHaveBeenCalledTimes(2);
  });
});
